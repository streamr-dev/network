import { NetworkPeerDescriptor, Operator, StreamrClient } from '@streamr/sdk'
import { EthereumAddress, Logger, StreamID, StreamPartID, StreamPartIDUtils } from '@streamr/utils'
import { shuffle } from 'lodash'
import sample from 'lodash/sample'
import without from 'lodash/without'
import { weightedSample } from '../../helpers/weightedSample'
import { ConsistentHashRing } from './ConsistentHashRing'
import { OperatorFleetState } from './OperatorFleetState'
import { StreamPartAssignments } from './StreamPartAssignments'

export type FindNodesForTargetGivenFleetStateFn = typeof findNodesForTargetGivenFleetState
export type InspectTargetFn = typeof inspectTarget

export interface Target {
    sponsorshipAddress: EthereumAddress
    operatorAddress: EthereumAddress
    streamPart: StreamPartID
}

function createStreamIDMatcher(streamId: StreamID): (streamPart: StreamPartID) => boolean {
    return (streamPart) => {
        return StreamPartIDUtils.getStreamID(streamPart) === streamId
    }
}

function isAnyPartitionOfStreamAssignedToMe(assignments: StreamPartAssignments, streamId: StreamID): boolean {
    return assignments.getMyStreamParts().some(createStreamIDMatcher(streamId))
}

function getPartitionsOfStreamAssignedToMe(assignments: StreamPartAssignments, streamId: StreamID): StreamPartID[] {
    return assignments.getMyStreamParts().filter(createStreamIDMatcher(streamId))
}

export async function findTarget(
    myOperatorContractAddress: EthereumAddress,
    myOperator: Operator,
    assignments: StreamPartAssignments,
    streamrClient: StreamrClient,
    logger: Logger
): Promise<Target | undefined> {
    // choose sponsorship
    const sponsorships = await myOperator.getSponsorships()
    const suitableSponsorships = sponsorships
        .filter(({ operatorCount }) => operatorCount >= 2) // exclude sponsorships with only self
        .filter(({ streamId }) => isAnyPartitionOfStreamAssignedToMe(assignments, streamId))
    if (suitableSponsorships.length === 0) {
        logger.info('Skip inspection (no suitable sponsorship)', { totalSponsorships: sponsorships.length })
        return undefined
    }
    const targetSponsorship = weightedSample(
        suitableSponsorships,
        ({ operatorCount }) => operatorCount - 1 // account for self to keep ratios correct
    )!

    // choose operator
    const operators = await myOperator.getOperatorsInSponsorship(targetSponsorship.sponsorshipAddress)
    const targetOperatorAddress = sample(without(operators, myOperatorContractAddress))
    if (targetOperatorAddress === undefined) {
        // Only happens if during the async awaits the other operator(s) were removed from the sponsorship.
        logger.info('Skip inspection (no suitable operator)', { targetSponsorship })
        return undefined
    }

    // choose stream part
    const streamParts = getPartitionsOfStreamAssignedToMe(assignments, targetSponsorship.streamId)
    const targetStreamPart = sample(streamParts)
    if (targetStreamPart === undefined) {
        // Only happens if during the async awaits the stream parts I am assigned to have changed.
        logger.info('Skip inspection (no suitable stream part)', { targetSponsorship, targetOperatorAddress })
        return undefined
    }

    const targetOperator = streamrClient.getOperator(targetOperatorAddress)
    const flagAlreadyRaised = await targetOperator.hasOpenFlag(targetSponsorship.sponsorshipAddress)
    if (flagAlreadyRaised) {
        logger.info('Skip inspection (target already has open flag)', { targetSponsorship, targetOperatorAddress })
        return undefined
    }

    return {
        sponsorshipAddress: targetSponsorship.sponsorshipAddress,
        operatorAddress: targetOperatorAddress,
        streamPart: targetStreamPart
    }
}

export async function findNodesForTargetGivenFleetState(
    target: Target,
    targetOperatorFleetState: OperatorFleetState,
    getRedundancyFactor: (operatorContractAddress: EthereumAddress) => Promise<number | undefined>,
    logger: Logger
): Promise<NetworkPeerDescriptor[]> {
    const replicationFactor = await getRedundancyFactor(target.operatorAddress)
    if (replicationFactor === undefined) {
        logger.debug('Encountered misconfigured replication factor')
        return []
    }

    const consistentHashRing = new ConsistentHashRing(replicationFactor)
    for (const nodeId of targetOperatorFleetState.getNodeIds()) {
        consistentHashRing.add(nodeId)
    }
    const targetNodes = consistentHashRing.get(target.streamPart)
    return targetNodes.map((nodeId) => targetOperatorFleetState.getPeerDescriptor(nodeId)!)
}

export async function inspectTarget({
    target,
    targetPeerDescriptors,
    streamrClient,
    abortSignal,
    logger
}: {
    target: Target
    targetPeerDescriptors: NetworkPeerDescriptor[]
    streamrClient: StreamrClient
    abortSignal: AbortSignal
    logger: Logger
}): Promise<boolean> {
    logger.info('Inspecting nodes of operator', {
        targetOperator: target.operatorAddress,
        targetStreamPart: target.streamPart,
        targetNodes: targetPeerDescriptors.map(({ nodeId }) => nodeId),
        targetSponsorship: target.sponsorshipAddress
    })

    // need to subscribe before inspecting, otherwise inspect will instantly return false
    const sub = await streamrClient.subscribe({
        id: StreamPartIDUtils.getStreamID(target.streamPart),
        partition: StreamPartIDUtils.getStreamPartition(target.streamPart),
        raw: true
    })

    try {
        for (const descriptor of shuffle(targetPeerDescriptors)) {
            // TODO: re-enable when works
            //const result = await streamrClient.inspect(descriptor, target.streamPart)
            const result = true
            abortSignal.throwIfAborted()
            if (result) {
                logger.info('Inspection done (no issue detected)', {
                    targetOperator: target.operatorAddress,
                    targetStreamPart: target.streamPart,
                    targetNode: descriptor.nodeId,
                    targetSponsorship: target.sponsorshipAddress
                })
                return true
            }
        }

        logger.info('Inspection done (issue detected)', {
            targetOperator: target.operatorAddress,
            targetStreamPart: target.streamPart,
            targetNodes: targetPeerDescriptors.map(({ nodeId }) => nodeId),
            targetSponsorship: target.sponsorshipAddress
        })
        return false
    } finally {
        await sub.unsubscribe()
    }
}

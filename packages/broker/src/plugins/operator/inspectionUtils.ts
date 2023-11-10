import { shuffle } from 'lodash'
import { NetworkPeerDescriptor, StreamrClient } from 'streamr-client'
import { CreateOperatorFleetStateFn, OperatorFleetState } from './OperatorFleetState'
import { StreamID, StreamPartID, StreamPartIDUtils } from '@streamr/protocol'
import { EthereumAddress, Logger, wait } from '@streamr/utils'
import { ConsistentHashRing } from './ConsistentHashRing'
import { StreamPartAssignments } from './StreamPartAssignments'
import { weightedSample } from '../../helpers/weightedSample'
import sample from 'lodash/sample'
import without from 'lodash/without'
import { formCoordinationStreamId } from './formCoordinationStreamId'
import { ContractFacade } from './ContractFacade'

const logger = new Logger(module)

export type FindTargetFn = typeof findTarget
export type FindNodesForTargetFn = typeof findNodesForTarget
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

function isAnyPartitionOfStreamAssignedToMe(
    assignments: StreamPartAssignments,
    streamId: StreamID
): boolean {
    return assignments.getMyStreamParts().some(createStreamIDMatcher(streamId))
}

function getPartitionsOfStreamAssignedToMe(
    assignments: StreamPartAssignments,
    streamId: StreamID
): StreamPartID[] {
    return assignments.getMyStreamParts().filter(createStreamIDMatcher(streamId))
}

export async function findTarget(
    myOperatorContractAddress: EthereumAddress,
    contractFacade: ContractFacade,
    assignments: StreamPartAssignments
): Promise<Target | undefined> {
    // choose sponsorship
    const sponsorships = await contractFacade.getSponsorshipsOfOperator(myOperatorContractAddress)
    const suitableSponsorships = sponsorships
        .filter(({ operatorCount }) => operatorCount >= 2)  // exclude sponsorships with only self
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
    const operators = await contractFacade.getOperatorsInSponsorship(targetSponsorship.sponsorshipAddress)
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

    return {
        sponsorshipAddress: targetSponsorship.sponsorshipAddress,
        operatorAddress: targetOperatorAddress,
        streamPart: targetStreamPart
    }
}

export async function findNodesForTarget(
    target: Target,
    getRedundancyFactor: (operatorContractAddress: EthereumAddress) => Promise<number | undefined>,
    createOperatorFleetState: CreateOperatorFleetStateFn,
    timeout: number,
    abortSignal: AbortSignal
): Promise<NetworkPeerDescriptor[]> {
    logger.debug('Waiting for node heartbeats', {
        targetOperator: target.operatorAddress,
        timeout
    })
    const targetOperatorFleetState = createOperatorFleetState(formCoordinationStreamId(target.operatorAddress))
    try {
        await targetOperatorFleetState.start()
        await Promise.race([
            targetOperatorFleetState.waitUntilReady(),
            wait(timeout, abortSignal)
        ])
        logger.debug('Finished waiting for heartbeats', {
            targetOperator: target.operatorAddress,
            onlineNodes: targetOperatorFleetState.getNodeIds().length,
        })
        return await findNodesForTargetGivenFleetState(target, targetOperatorFleetState, getRedundancyFactor)
    } finally {
        await targetOperatorFleetState.destroy()
    }
}

export async function findNodesForTargetGivenFleetState(
    target: Target,
    targetOperatorFleetState: OperatorFleetState,
    getRedundancyFactor: (operatorContractAddress: EthereumAddress) => Promise<number | undefined>,
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
    abortSignal
}: {
    target: Target
    targetPeerDescriptors: NetworkPeerDescriptor[]
    streamrClient: StreamrClient
    abortSignal: AbortSignal
}): Promise<boolean> {

    logger.info('Inspecting nodes of operator', {
        targetOperator: target.operatorAddress,
        targetStreamPart: target.streamPart,
        targetNodes: targetPeerDescriptors.map(({ id }) => id),
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
            const result = await streamrClient.inspect(descriptor, target.streamPart)
            abortSignal.throwIfAborted()
            if (result) {
                logger.info('Inspection done (no issue detected)', {
                    targetOperator: target.operatorAddress,
                    targetStreamPart: target.streamPart,
                    targetNode: descriptor.id,
                    targetSponsorship: target.sponsorshipAddress
                })
                return true
            }
        }

        logger.info('Inspection done (issue detected)', {
            targetOperator: target.operatorAddress,
            targetStreamPart: target.streamPart,
            targetNodes: targetPeerDescriptors.map(({ id }) => id),
            targetSponsorship: target.sponsorshipAddress
        })
        return false
    } finally {
        await sub.unsubscribe()
    }
}

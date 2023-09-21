import { shuffle } from 'lodash'
import { NetworkPeerDescriptor, StreamrClient } from 'streamr-client'
import { OperatorFleetState } from './OperatorFleetState'
import { StreamID, StreamPartID, StreamPartIDUtils, toStreamID } from '@streamr/protocol'
import { EthereumAddress, Logger, wait } from '@streamr/utils'
import { ConsistentHashRing } from './ConsistentHashRing'
import { StreamAssignmentLoadBalancer } from './StreamAssignmentLoadBalancer'
import { InspectRandomNodeHelper } from './InspectRandomNodeHelper'
import { weightedSample } from '../../helpers/weightedSample'
import sample from 'lodash/sample'
import without from 'lodash/without'

const logger = new Logger(module)

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
    loadBalancer: StreamAssignmentLoadBalancer,
    streamId: StreamID
): boolean {
    return loadBalancer.getMyStreamParts().some(createStreamIDMatcher(streamId))
}

function getPartitionsOfStreamAssignedToMe(
    loadBalancer: StreamAssignmentLoadBalancer,
    streamId: StreamID
): StreamPartID[] {
    return loadBalancer.getMyStreamParts().filter(createStreamIDMatcher(streamId))
}

export async function findTarget(
    myOperatorContractAddress: EthereumAddress,
    helper: InspectRandomNodeHelper,
    loadBalancer: StreamAssignmentLoadBalancer
): Promise<Target | undefined> {
    // choose sponsorship
    const sponsorships = await helper.getSponsorshipsOfOperator(myOperatorContractAddress)
    const suitableSponsorships = sponsorships
        .filter(({ operatorCount }) => operatorCount >= 2)  // exclude sponsorships with only self
        .filter(({ streamId }) => isAnyPartitionOfStreamAssignedToMe(loadBalancer, streamId))
    if (suitableSponsorships.length === 0) {
        logger.info('Skip inspection (no suitable sponsorship)', { totalSponsorships: sponsorships.length })
        return undefined
    }
    const targetSponsorship = weightedSample(
        suitableSponsorships,
        ({ operatorCount }) => operatorCount - 1 // account for self to keep ratios correct
    )!

    // choose operator
    const operators = await helper.getOperatorsInSponsorship(targetSponsorship.sponsorshipAddress)
    const targetOperatorAddress = sample(without(operators, myOperatorContractAddress))
    if (targetOperatorAddress === undefined) {
        // Only happens if during the async awaits the other operator(s) were removed from the sponsorship.
        logger.info('Skip inspection (no suitable operator)', { targetSponsorship })
        return undefined
    }

    // choose stream part
    const streamParts = getPartitionsOfStreamAssignedToMe(loadBalancer, targetSponsorship.streamId)
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
    streamrClient: StreamrClient,
    getRedundancyFactor: (operatorContractAddress: EthereumAddress) => Promise<number | undefined>,
    timeout: number,
    abortSignal: AbortSignal
): Promise<NetworkPeerDescriptor[]> {
    logger.debug('Waiting for node heartbeats', {
        targetOperator: target.operatorAddress,
        timeout
    })
    const targetOperatorFleetState = new OperatorFleetState(
        streamrClient,
        toStreamID('/operator/coordination', target.operatorAddress)
    )
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
    } finally {
        await targetOperatorFleetState.destroy()
    }
}

export async function inspectTarget({
    target,
    streamrClient,
    getRedundancyFactor,
    heartbeatTimeoutInMs,
    abortSignal,
    findNodesForTargetFn = findNodesForTarget
}: {
    target: Target
    streamrClient: StreamrClient
    getRedundancyFactor: (operatorContractAddress: EthereumAddress) => Promise<number | undefined>
    heartbeatTimeoutInMs: number
    abortSignal: AbortSignal
    findNodesForTargetFn?: typeof findNodesForTarget
}): Promise<boolean> {
    const targetPeerDescriptors = await findNodesForTargetFn(
        target,
        streamrClient,
        getRedundancyFactor,
        heartbeatTimeoutInMs,
        abortSignal
    )

    logger.info('Inspecting nodes of operator', {
        targetOperator: target.operatorAddress,
        targetStreamPart: target.streamPart,
        targetNodes: targetPeerDescriptors.map(({ id }) => id),
        targetSponsorship: target.sponsorshipAddress
    })

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
}

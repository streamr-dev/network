import { shuffle } from 'lodash'
import { NetworkPeerDescriptor, StreamrClient } from 'streamr-client'
import { OperatorFleetState } from './OperatorFleetState'
import { StreamPartID, toStreamID } from '@streamr/protocol'
import { EthereumAddress, Logger, wait } from '@streamr/utils'
import { ConsistentHashRing } from './ConsistentHashRing'
import { FetchRedundancyFactorFn } from './InspectRandomNodeService'

const logger = new Logger(module)

export interface Target {
    sponsorshipAddress: EthereumAddress
    operatorAddress: EthereumAddress
    streamPart: StreamPartID
}

export async function findNodesForTarget(
    target: Target,
    streamrClient: StreamrClient,
    fetchRedundancyFactorFn: FetchRedundancyFactorFn,
    maxWait: number,
    abortSignal: AbortSignal
): Promise<NetworkPeerDescriptor[]> {
    logger.debug('Waiting for node heartbeats', {
        targetOperator: target.operatorAddress,
        maxWait
    })
    const targetOperatorFleetState = new OperatorFleetState(
        streamrClient,
        toStreamID('/operator/coordination', target.operatorAddress)
    )
    try {
        await targetOperatorFleetState.start()
        await Promise.race([
            targetOperatorFleetState.waitUntilReady(),
            wait(maxWait, abortSignal)
        ])
        logger.debug('Finished waiting for heartbeats', {
            targetOperator: target.operatorAddress,
            onlineNodes: targetOperatorFleetState.getNodeIds().length,
        })

        const replicationFactor = await fetchRedundancyFactorFn({
            operatorContractAddress: target.operatorAddress,
            signer: await streamrClient.getSigner()
        })
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
    fetchRedundancyFactor,
    heartbeatLastResortTimeoutInMs,
    abortSignal,
    findNodesForTargetFn = findNodesForTarget
}: {
    target: Target
    streamrClient: StreamrClient
    fetchRedundancyFactor: FetchRedundancyFactorFn
    heartbeatLastResortTimeoutInMs: number
    abortSignal: AbortSignal
    findNodesForTargetFn?: typeof findNodesForTarget
}): Promise<boolean> {
    const targetPeerDescriptors = await findNodesForTargetFn(
        target,
        streamrClient,
        fetchRedundancyFactor,
        heartbeatLastResortTimeoutInMs,
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

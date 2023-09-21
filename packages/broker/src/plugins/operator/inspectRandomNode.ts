import { EthereumAddress, Logger } from '@streamr/utils'
import { InspectRandomNodeHelper } from './InspectRandomNodeHelper'
import { StreamAssignmentLoadBalancer } from './StreamAssignmentLoadBalancer'
import { StreamrClient } from 'streamr-client'
import { StreamPartIDUtils } from '@streamr/protocol'
import { findNodesForTarget, findTarget, inspectTarget } from './inspectionUtils'

const logger = new Logger(module)

export type FindTargetFn = typeof findTarget
export type FindNodesForTargetFn = typeof findNodesForTarget
export type InspectTargetFn = typeof inspectTarget

export async function inspectRandomNode(
    operatorContractAddress: EthereumAddress,
    helper: InspectRandomNodeHelper,
    loadBalancer: StreamAssignmentLoadBalancer,
    streamrClient: StreamrClient,
    heartbeatTimeoutInMs: number,
    getRedundancyFactor: (operatorContractAddress: EthereumAddress) => Promise<number | undefined>,
    abortSignal: AbortSignal,
    findTargetFn = findTarget,
    findNodesForTargetFn = findNodesForTarget,
    inspectTargetFn = inspectTarget
): Promise<void> {
    logger.info('Select a random operator to inspect')

    const target = await findTargetFn(operatorContractAddress, helper, loadBalancer)
    if (target === undefined) {
        return
    }

    const onlineNodeDescriptors = await findNodesForTargetFn(
        target,
        streamrClient,
        getRedundancyFactor,
        heartbeatTimeoutInMs,
        abortSignal
    )

    const pass = await inspectTargetFn({
        target,
        targetPeerDescriptors: onlineNodeDescriptors,
        streamrClient,
        abortSignal
    })

    if (!pass) {
        logger.info('Raise flag', { target })
        await helper.flag(
            target.sponsorshipAddress,
            target.operatorAddress,
            StreamPartIDUtils.getStreamPartition(target.streamPart)
        )
    }
}

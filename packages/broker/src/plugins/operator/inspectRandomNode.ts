import { EthereumAddress, Logger } from '@streamr/utils'
import { StreamPartAssignments } from './StreamPartAssignments'
import { StreamrClient } from 'streamr-client'
import { StreamPartIDUtils } from '@streamr/protocol'
import { findNodesForTarget, findTarget, inspectTarget } from './inspectionUtils'
import { ContractFacade } from './ContractFacade'
import { CreateOperatorFleetStateFn } from './OperatorFleetState'

const logger = new Logger(module)

export type FindTargetFn = typeof findTarget
export type FindNodesForTargetFn = typeof findNodesForTarget
export type InspectTargetFn = typeof inspectTarget

export async function inspectRandomNode(
    operatorContractAddress: EthereumAddress,
    contractFacade: ContractFacade,
    assignments: StreamPartAssignments,
    streamrClient: StreamrClient,
    heartbeatTimeoutInMs: number,
    getRedundancyFactor: (operatorContractAddress: EthereumAddress) => Promise<number | undefined>,
    createOperatorFleetState: CreateOperatorFleetStateFn,
    abortSignal: AbortSignal,
    findTargetFn = findTarget,
    findNodesForTargetFn = findNodesForTarget,
    inspectTargetFn = inspectTarget
): Promise<void> {
    logger.info('Select a random operator to inspect')

    const target = await findTargetFn(operatorContractAddress, contractFacade, assignments)
    if (target === undefined) {
        return
    }

    const onlineNodeDescriptors = await findNodesForTargetFn(
        target,
        getRedundancyFactor,
        createOperatorFleetState,
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
        await contractFacade.flag(
            target.sponsorshipAddress,
            target.operatorAddress,
            StreamPartIDUtils.getStreamPartition(target.streamPart)
        )
    }
}

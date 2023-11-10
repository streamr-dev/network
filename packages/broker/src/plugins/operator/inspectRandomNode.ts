import { EthereumAddress, Logger } from '@streamr/utils'
import { StreamPartAssignments } from './StreamPartAssignments'
import { StreamrClient } from 'streamr-client'
import { StreamPartIDUtils } from '@streamr/protocol'
import { findTarget } from './inspectionUtils'
import { ContractFacade } from './ContractFacade'
import { CreateOperatorFleetStateFn } from './OperatorFleetState'
import { inspectOverTime } from './inspectOverTime'

const logger = new Logger(module)

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
): Promise<void> {
    logger.info('Select a random operator to inspect')

    const target = await findTargetFn(operatorContractAddress, contractFacade, assignments)
    if (target === undefined) {
        return
    }
    logger.debug('Target established', { target })

    const result = inspectOverTime({
        target,
        streamrClient,
        createOperatorFleetState,
        getRedundancyFactor,
        sleepTimeInMsBeforeFirstInspection: 0,
        heartbeatTimeoutInMs,
        inspectionIntervalInMs: 2 * 60 * 1000,
        maxInspections: 3,
        abortSignal
    })

    const pass = await result.waitForResults()
    if (!pass) {
        logger.info('Raise flag', { target })
        await contractFacade.flag(
            target.sponsorshipAddress,
            target.operatorAddress,
            StreamPartIDUtils.getStreamPartition(target.streamPart)
        )
    } else {
        logger.debug('Inspection passed (not raising flag)', { target })
    }
}

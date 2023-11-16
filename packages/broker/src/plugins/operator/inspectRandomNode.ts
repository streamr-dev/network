import { EthereumAddress, Logger, randomString } from '@streamr/utils'
import { StreamPartAssignments } from './StreamPartAssignments'
import { StreamrClient } from 'streamr-client'
import { StreamPartIDUtils } from '@streamr/protocol'
import { findTarget } from './inspectionUtils'
import { ContractFacade } from './ContractFacade'
import { CreateOperatorFleetStateFn } from './OperatorFleetState'
import { inspectOverTime } from './inspectOverTime'

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
    const traceId = randomString(6)
    const logger = new Logger(module, { traceId })
    logger.info('Select a random operator to inspect')

    const target = await findTargetFn(operatorContractAddress, contractFacade, assignments, logger)
    if (target === undefined) {
        return
    }
    logger.debug('Target established', { target })

    const consumeResults = inspectOverTime({
        target,
        streamrClient,
        createOperatorFleetState,
        getRedundancyFactor,
        sleepTimeInMsBeforeFirstInspection: 0,
        heartbeatTimeoutInMs,
        inspectionIntervalInMs: 8 * 60 * 1000,
        maxInspections: 10,
        waitUntilPassOrDone: true,
        abortSignal,
        traceId
    })

    const results = await consumeResults()
    if (!results.some((pass) => pass)) {
        logger.info('Raise flag', { target })
        await contractFacade.flag(
            target.sponsorshipAddress,
            target.operatorAddress,
            StreamPartIDUtils.getStreamPartition(target.streamPart)
        )
    } else {
        logger.info('Not raising flag', { target })
    }
}

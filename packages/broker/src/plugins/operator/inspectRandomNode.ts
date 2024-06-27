import { StreamPartIDUtils } from '@streamr/protocol'
import { Operator, StreamrClient } from '@streamr/sdk'
import { EthereumAddress, Logger, randomString } from '@streamr/utils'
import { CreateOperatorFleetStateFn } from './OperatorFleetState'
import { StreamPartAssignments } from './StreamPartAssignments'
import { inspectOverTime } from './inspectOverTime'
import { findTarget } from './inspectionUtils'

export async function inspectRandomNode(
    operatorContractAddress: EthereumAddress,
    operator: Operator,
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

    const target = await findTargetFn(operatorContractAddress, operator, assignments, streamrClient, logger)
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
    if (results.some((pass) => pass)) {
        logger.info('Not raising flag', { target })
        return
    }

    const flagAlreadyRaised = await (await streamrClient.getOperator(target.operatorAddress)).hasOpenFlag(target.sponsorshipAddress)
    if (flagAlreadyRaised) {
        logger.info('Not raising flag (target already has open flag)', { target })
        return
    }

    logger.info('Raise flag', { target })
    await operator.flag(
        target.sponsorshipAddress,
        target.operatorAddress,
        StreamPartIDUtils.getStreamPartition(target.streamPart)
    )
}

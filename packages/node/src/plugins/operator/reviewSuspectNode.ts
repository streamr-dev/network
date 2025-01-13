import { Operator, StreamrClient } from '@streamr/sdk'
import { EthereumAddress, Logger, randomString, setAbortableTimeout, toStreamPartID } from '@streamr/utils'
import random from 'lodash/random'
import { CreateOperatorFleetStateFn } from './OperatorFleetState'
import { inspectOverTime } from './inspectOverTime'

const logger = new Logger(module)

export interface ReviewProcessOpts {
    sponsorshipAddress: EthereumAddress
    targetOperator: EthereumAddress
    partition: number
    myOperator: Operator
    streamrClient: StreamrClient
    createOperatorFleetState: CreateOperatorFleetStateFn
    getRedundancyFactor: (operatorContractAddress: EthereumAddress) => Promise<number | undefined>
    maxDelayBeforeFirstInspectionInMs: number
    heartbeatTimeoutInMs: number
    votingPeriod: {
        startTime: number
        endTime: number
    }
    inspectionIntervalInMs: number
    maxInspectionCount: number
    abortSignal: AbortSignal
}

export const reviewSuspectNode = async ({
    sponsorshipAddress,
    targetOperator,
    partition,
    myOperator,
    streamrClient,
    createOperatorFleetState,
    getRedundancyFactor,
    maxDelayBeforeFirstInspectionInMs,
    heartbeatTimeoutInMs,
    votingPeriod,
    inspectionIntervalInMs,
    maxInspectionCount,
    abortSignal
}: ReviewProcessOpts): Promise<void> => {
    if (Date.now() + maxDelayBeforeFirstInspectionInMs > votingPeriod.startTime) {
        throw new Error('Max delay time overlaps with voting period')
    }
    const streamId = await myOperator.getStreamId(sponsorshipAddress)
    // random wait time to make sure multiple instances of voters don't all inspect at the same time
    const delayBeforeFirstInspectionInMs = random(maxDelayBeforeFirstInspectionInMs)
    const consumeResults = inspectOverTime({
        target: {
            sponsorshipAddress: sponsorshipAddress,
            operatorAddress: targetOperator,
            streamPart: toStreamPartID(streamId, partition)
        },
        streamrClient,
        createOperatorFleetState,
        getRedundancyFactor,
        delayBeforeFirstInspectionInMs,
        heartbeatTimeoutInMs,
        inspectionIntervalInMs,
        maxInspectionCount,
        waitUntilPassOrDone: false,
        abortSignal,
        traceId: randomString(6)
    })

    const timeUntilVoteInMs = (votingPeriod.startTime + votingPeriod.endTime) / 2 - Date.now()
    logger.debug('Schedule voting on flag', { timeUntilVoteInMs })
    setAbortableTimeout(
        async () => {
            const results = await consumeResults()
            const kick = results.filter((b) => b).length <= results.length / 2
            logger.info('Vote on flag', { sponsorshipAddress, targetOperator, kick })
            try {
                await myOperator.voteOnFlag(sponsorshipAddress, targetOperator, kick)
            } catch (err) {
                logger.warn('Encountered error while voting on flag', {
                    sponsorshipAddress,
                    targetOperator,
                    kick,
                    reason: err?.message
                })
            }
        },
        timeUntilVoteInMs,
        abortSignal
    )
}

import { EthereumAddress, Logger, randomString, setAbortableTimeout } from '@streamr/utils'
import { ContractFacade } from './ContractFacade'
import { StreamrClient } from 'streamr-client'
import { CreateOperatorFleetStateFn } from './OperatorFleetState'
import { toStreamPartID } from '@streamr/protocol'
import random from 'lodash/random'
import { inspectOverTime } from './inspectOverTime'

const logger = new Logger(module)

export interface ReviewProcessOpts {
    sponsorshipAddress: EthereumAddress
    targetOperator: EthereumAddress
    partition: number
    contractFacade: ContractFacade
    streamrClient: StreamrClient
    createOperatorFleetState: CreateOperatorFleetStateFn
    getRedundancyFactor: (operatorContractAddress: EthereumAddress) => Promise<number | undefined>
    maxSleepTime: number
    heartbeatTimeoutInMs: number
    votingPeriod: {
        startTime: number
        endTime: number
    }
    inspectionIntervalInMs: number
    maxInspections: number
    abortSignal: AbortSignal
}

export const reviewSuspectNode = async ({
    sponsorshipAddress,
    targetOperator,
    partition,
    contractFacade,
    streamrClient,
    createOperatorFleetState,
    getRedundancyFactor,
    maxSleepTime,
    heartbeatTimeoutInMs,
    votingPeriod,
    inspectionIntervalInMs,
    maxInspections,
    abortSignal
}: ReviewProcessOpts): Promise<void> => {
    if (Date.now() + maxSleepTime > votingPeriod.startTime) {
        throw new Error('Max sleep time overlaps with voting period')
    }
    const streamId = await contractFacade.getStreamId(sponsorshipAddress)
    // random sleep time to make sure multiple instances of voters don't all inspect at the same time
    const sleepTimeInMsBeforeFirstInspection = random(maxSleepTime)
    const consumeResults = inspectOverTime({
        target: {
            sponsorshipAddress: sponsorshipAddress,
            operatorAddress: targetOperator,
            streamPart: toStreamPartID(streamId, partition),
        },
        streamrClient,
        createOperatorFleetState,
        getRedundancyFactor,
        sleepTimeInMsBeforeFirstInspection,
        heartbeatTimeoutInMs,
        inspectionIntervalInMs,
        maxInspections,
        waitUntilPassOrDone: false,
        abortSignal,
        traceId: randomString(6)
    })

    const timeUntilVoteInMs = ((votingPeriod.startTime + votingPeriod.endTime) / 2) - Date.now()
    logger.debug('Schedule voting on flag', { timeUntilVoteInMs })
    setAbortableTimeout(async () => {
        const results = await consumeResults()
        const kick = results.filter((b) => b).length <= results.length / 2
        logger.info('Vote on flag', { sponsorshipAddress, targetOperator, kick })
        await contractFacade.voteOnFlag(sponsorshipAddress, targetOperator, kick)
    }, timeUntilVoteInMs, abortSignal)
}

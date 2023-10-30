import {
    composeAbortSignals,
    EthereumAddress,
    Logger,
    randomString,
    scheduleAtInterval,
    setAbortableTimeout, wait
} from '@streamr/utils'
import { ContractFacade } from './ContractFacade'
import { StreamrClient } from 'streamr-client'
import { CreateOperatorFleetStateFn } from './OperatorFleetState'
import { toStreamPartID } from '@streamr/protocol'
import { formCoordinationStreamId } from './formCoordinationStreamId'
import { findNodesForTargetGivenFleetState, inspectTarget } from './inspectionUtils'
import random from 'lodash/random'

export interface ReviewProcessOpts {
    sponsorshipAddress: EthereumAddress
    targetOperator: EthereumAddress
    partition: number
    contractFacade: ContractFacade
    streamrClient: StreamrClient
    createOperatorFleetState: CreateOperatorFleetStateFn
    getRedundancyFactor: (operatorContractAddress: EthereumAddress) => Promise<number | undefined>
    maxSleepTime: number
    votingPeriod: {
        startTime: number
        endTime: number
    }
    inspectionIntervalInMs: number
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
    votingPeriod,
    inspectionIntervalInMs,
    abortSignal: userAbortSignal
}: ReviewProcessOpts): Promise<void> => {
    const logger = new Logger(module, { id: randomString(6) })
    const inspectionResults = new Array<boolean>()

    logger.info('Start handling of inspection request')
    const streamId = await contractFacade.getStreamId(sponsorshipAddress)
    const target = {
        sponsorshipAddress: sponsorshipAddress,
        operatorAddress: targetOperator,
        streamPart: toStreamPartID(streamId, partition),
    }
    logger.info('Establish target', { target })

    const fleetState = createOperatorFleetState(formCoordinationStreamId(targetOperator))
    await fleetState.start()
    logger.info('Waiting for fleet state')
    await fleetState.waitUntilReady()
    logger.info('Wait done for fleet state')

    const abortController = new AbortController()
    const abortSignal = composeAbortSignals(userAbortSignal, abortController.signal)
    abortSignal.addEventListener('abort', async () => {
        await fleetState.destroy()
    })

    // random sleep time to make sure multiple instances of voters don't all inspect at the same time
    const sleepTimeInMs = random(maxSleepTime)
    logger.info('Sleep', { sleepTimeInMs })
    await wait(sleepTimeInMs, abortSignal)

    // inspection
    await scheduleAtInterval(async () => {
        logger.info('Inspecting target', {
            target,
            attemptNo: inspectionResults.length + 1
        })
        const onlineNodeDescriptors = await findNodesForTargetGivenFleetState(
            target,
            fleetState,
            getRedundancyFactor
        )
        const pass = await inspectTarget({
            target,
            targetPeerDescriptors: onlineNodeDescriptors,
            streamrClient,
            abortSignal
        })
        logger.info('Inspected target', {
            target,
            attemptNo: inspectionResults.length + 1,
            pass,
            inspectionResults
        })
        inspectionResults.push(pass)
    }, inspectionIntervalInMs, true, abortSignal)

    // voting
    const timeUntilVoteInMs = ((votingPeriod.startTime + votingPeriod.endTime) / 2) - Date.now()
    setAbortableTimeout(async () => {
        try {
            const passCount = inspectionResults.filter((pass) => pass).length
            const kick = passCount <= inspectionResults.length / 2
            logger.info('Vote on inspection request', {
                target,
                passCount,
                totalInspections: inspectionResults.length,
                kick
            })
            await contractFacade.voteOnFlag(target.sponsorshipAddress, target.operatorAddress, kick)
        } finally {
            abortController.abort()
        }
    }, timeUntilVoteInMs, abortSignal)
}

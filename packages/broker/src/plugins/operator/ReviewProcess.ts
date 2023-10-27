import { composeAbortSignals, EthereumAddress, Logger, scheduleAtInterval, setAbortableTimeout } from '@streamr/utils'
import { ContractFacade } from './ContractFacade'
import { StreamrClient } from 'streamr-client'
import { CreateOperatorFleetStateFn } from './OperatorFleetState'
import { toStreamPartID } from '@streamr/protocol'
import { formCoordinationStreamId } from './formCoordinationStreamId'
import { findNodesForTargetGivenFleetState, inspectTarget } from './inspectionUtils'

export interface ReviewProcessOpts {
    sponsorshipAddress: EthereumAddress
    targetOperator: EthereumAddress
    partition: number
    contractFacade: ContractFacade
    streamrClient: StreamrClient
    createOperatorFleetState: CreateOperatorFleetStateFn
    redundancyFactor: number
    getRedundancyFactor: (operatorContractAddress: EthereumAddress) => Promise<number | undefined>
    timeUntilVoteInMs: number
    inspectionIntervalInMs: number
    abortSignal: AbortSignal
}

let NEXT_ID = 0

export const startReviewProcess = async ({
    sponsorshipAddress,
    targetOperator,
    partition,
    contractFacade,
    streamrClient,
    createOperatorFleetState,
    getRedundancyFactor,
    timeUntilVoteInMs,
    inspectionIntervalInMs,
    abortSignal: userAbortSignal
}: ReviewProcessOpts): Promise<void> => {
    const logger = new Logger(module, { id: NEXT_ID++ })
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

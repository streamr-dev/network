import { EthereumAddress, Logger } from '@streamr/utils'
import { VoteOnSuspectNodeHelper } from './VoteOnSuspectNodeHelper'
import { findNodesForTarget, inspectTarget } from './inspectionUtils'
import { toStreamPartID } from '@streamr/protocol'
import { StreamrClient } from 'streamr-client'
import { fetchRedundancyFactor as _fetchRedundancyFactor } from './fetchRedundancyFactor'
import { CreateOperatorFleetStateFn } from './OperatorFleetState'

const logger = new Logger(module)

export async function inspectSuspectNode(
    sponsorship: EthereumAddress,
    targetOperator: EthereumAddress,
    partition: number,
    voteOnSuspectNodeHelper: VoteOnSuspectNodeHelper,
    streamrClient: StreamrClient,
    abortSignal: AbortSignal,
    getRedundancyFactor: (operatorContractAddress: EthereumAddress) => Promise<number | undefined>,
    createOperatorFleetState: CreateOperatorFleetStateFn,
    heartbeatTimeoutInMs = 60 * 1000,
): Promise<void> {
    logger.info('Received inspection request', { targetOperator, sponsorship, partition })
    const streamId = await voteOnSuspectNodeHelper.getStreamId(sponsorship)
    const target = {
        sponsorshipAddress: sponsorship, 
        operatorAddress: targetOperator,
        streamPart: toStreamPartID(streamId, partition),
    }
    const onlineNodeDescriptors = await findNodesForTarget(
        target,
        getRedundancyFactor,
        createOperatorFleetState,
        heartbeatTimeoutInMs,
        abortSignal
    )
    const pass = await inspectTarget({
        target,
        targetPeerDescriptors: onlineNodeDescriptors,
        streamrClient,
        abortSignal
    })
    const kick = !pass
    logger.info('Vote on inspection request', { sponsorship, targetOperator, partition, kick })
    await voteOnSuspectNodeHelper.voteOnFlag(sponsorship, targetOperator, kick)
}

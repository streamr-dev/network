import { EthereumAddress, Logger } from '@streamr/utils'
import { VoteOnSuspectNodeHelper } from './VoteOnSuspectNodeHelper'
import { inspectTarget } from './inspectionUtils'
import { toStreamPartID } from '@streamr/protocol'
import { StreamrClient } from 'streamr-client'
import { fetchRedundancyFactor as _fetchRedundancyFactor } from './fetchRedundancyFactor'

const logger = new Logger(module)

export async function inspectSuspectNode(
    sponsorship: EthereumAddress,
    targetOperator: EthereumAddress,
    partition: number,
    voteOnSuspectNodeHelper: VoteOnSuspectNodeHelper,
    streamrClient: StreamrClient,
    abortSignal: AbortSignal,
    fetchRedundancyFactor = _fetchRedundancyFactor,
    heartbeatLastResortTimeoutInMs = 60 * 1000,
): Promise<void> {
    logger.info('Received inspection request', { targetOperator, sponsorship, partition })
    const streamId = await voteOnSuspectNodeHelper.getStreamId(sponsorship)
    const pass = await inspectTarget({
        target: {
            sponsorshipAddress: sponsorship,
            operatorAddress: targetOperator,
            streamPart: toStreamPartID(streamId, partition),
        },
        streamrClient,
        abortSignal,
        fetchRedundancyFactor,
        heartbeatLastResortTimeoutInMs,
    })
    const kick = !pass
    logger.info('Vote on inspection request', { sponsorship, targetOperator, partition, kick })
    await voteOnSuspectNodeHelper.voteOnFlag(sponsorship, targetOperator, kick)
}

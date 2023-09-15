import { Logger } from '@streamr/utils'
import { VoteOnSuspectNodeHelper } from './VoteOnSuspectNodeHelper'

const logger = new Logger(module)

export async function inspectSuspectNode(
    sponsorship: string,
    targetOperator: string,
    partition: number,
    voteOnSuspectNodeHelper: VoteOnSuspectNodeHelper
): Promise<void> {
    logger.info('Received inspection request', { targetOperator, sponsorship, partition })
    const kick = true
    logger.info('Vote on inspection request', { sponsorship, targetOperator, partition, kick })
    await voteOnSuspectNodeHelper.voteOnFlag(sponsorship, targetOperator, kick)
}

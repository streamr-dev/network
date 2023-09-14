import { Logger } from '@streamr/utils'
import { VoteOnSuspectNodeHelper } from './VoteOnSuspectNodeHelper'

const logger = new Logger(module)

export async function inspectSuspectNode(
    voteOnSuspectNodeHelper: VoteOnSuspectNodeHelper,
    sponsorship: string,
    targetOperator: string,
    partition: number
): Promise<void> {
    logger.info('Received inspection request', { targetOperator, sponsorship, partition })
    const kick = true
    logger.info('Vote on inspection request', { sponsorship, targetOperator, partition, kick })
    await voteOnSuspectNodeHelper.voteOnFlag(sponsorship, targetOperator, kick)
}

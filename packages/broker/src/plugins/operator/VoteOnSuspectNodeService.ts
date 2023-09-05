import { Logger } from '@streamr/utils'
import { StreamrClient } from 'streamr-client'
import { VoteOnSuspectNodeHelper } from './VoteOnSuspectNodeHelper'
import { OperatorFleetState } from './OperatorFleetState'
import { createIsLeaderFn } from './createIsLeaderFn'

const logger = new Logger(module)
export class VoteOnSuspectNodeService {
    private readonly voteOnSuspectNodeHelper: VoteOnSuspectNodeHelper
    private readonly streamrClient: StreamrClient
    private readonly operatorFleetState: OperatorFleetState
    private isLeader?: () => boolean

    constructor(
        helper: VoteOnSuspectNodeHelper,
        streamrClient: StreamrClient,
        operatorFleetState: OperatorFleetState
    ) {
        this.voteOnSuspectNodeHelper = helper
        this.streamrClient = streamrClient
        this.operatorFleetState = operatorFleetState
    }

    async start(): Promise<void> {
        await this.operatorFleetState.waitUntilReady()
        this.isLeader = await createIsLeaderFn(this.streamrClient, this.operatorFleetState, logger)
        await this.voteOnSuspectNodeHelper.start(this.handleNodeInspectionRequest)
    }

    stop(): void {
        this.voteOnSuspectNodeHelper.stop()
    }

    private handleNodeInspectionRequest = (sponsorship: string, targetOperator: string): void => {
        logger.info('Received inspection request', { targetOperator, sponsorship })
        if (this.isLeader!()) {
            const kick = true
            logger.info('Vote on inspection request', { sponsorship, targetOperator, kick })
            this.voteOnSuspectNodeHelper.voteOnFlag(sponsorship, targetOperator, kick).catch((err) => {
                logger.warn('Encountered error when trying to vote on flag', { err })
            })
        }
    }
}

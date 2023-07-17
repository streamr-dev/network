import { Logger } from '@streamr/utils'
import StreamrClient from 'streamr-client'
import { OperatorServiceConfig } from './OperatorPlugin'
import { VoteOnSuspectNodeHelper } from './VoteOnSuspectNodeHelper'

const logger = new Logger(module)
export class VoteOnSuspectNodeService {
    private readonly streamrClient: StreamrClient
    private readonly voteOnSuspectNodeHelper: VoteOnSuspectNodeHelper

    constructor(streamrClient: StreamrClient, serviceConfig: OperatorServiceConfig) {
        this.streamrClient = streamrClient
        this.voteOnSuspectNodeHelper = new VoteOnSuspectNodeHelper(
            serviceConfig,
            this.handleNodeInspectionRequest.bind(this)
        )
    }

    async start(): Promise<void> {
        await this.voteOnSuspectNodeHelper.start()
    }

    async stop(): Promise<void> {
        this.voteOnSuspectNodeHelper.stop()
    }

    handleNodeInspectionRequest(sponsorship: string, targetOperator: string): void {
        logger.info('Received inspection request', { targetOperator, sponsorship })
        //const operatorIsMalicious = this.streamrClient.inspectNodes(sponsorship, targetOperato)
        const operatorIsMalicious = true
        logger.info(`Vote on inspection request', ${{ sponsorship, targetOperator, kick: operatorIsMalicious }}`)
        this.voteOnSuspectNodeHelper.voteOnFlag(sponsorship, targetOperator, operatorIsMalicious).catch((err) => {
            logger.warn('Encountered error while trying to vote on flag', { err })
        })
    }
}

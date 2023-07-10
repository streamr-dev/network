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
        logger.debug('starting')
        await this.voteOnSuspectNodeHelper.start()
        logger.debug('started')
    }

    async stop(): Promise<void> {
        this.voteOnSuspectNodeHelper.stop()
    }

    async handleNodeInspectionRequest(sponsorship: string, targetOperator: string): Promise<void> {
        logger.info('Received inspection request', { targetOperator, sponsorship })
        //const operatorIsMalicious = this.streamrClient.inspectNodes(sponsorship, targetOperato)
        const operatorIsMalicious = true
        logger.info(`Vote on inspection request', ${{ sponsorship, targetOperator, kick: operatorIsMalicious }}`)
        await this.voteOnSuspectNodeHelper.voteOnFlag(sponsorship, targetOperator, operatorIsMalicious)
    }
}

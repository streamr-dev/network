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
        this.voteOnSuspectNodeHelper = new VoteOnSuspectNodeHelper(serviceConfig,
            this.handleNodeInspectionRequest.bind(this))
    }

    async start(): Promise<void> {
        logger.info('Starting NodeInspectionService')
        await this.voteOnSuspectNodeHelper.start()
        logger.info('Started MaintainTopologyService')
    }

    async stop(): Promise<void> {
        this.voteOnSuspectNodeHelper.stop()
        logger.info('stopped')
    }

    async handleNodeInspectionRequest(sponsorship: string, targetOperator: string): Promise<void> {
        logger.info(`got node inspection request for target ${targetOperator} on sponsorship ${sponsorship}`)
        //const operatorIsMalicious = this.streamrClient.inspectNodes(sponsorship, targetOperato)
        const operatorIsMalicious = true
        if (operatorIsMalicious) {
            logger.info(`operatorIsMalicious, voting KICK on ${targetOperator} on sponsorship ${sponsorship}`)
            await this.voteOnSuspectNodeHelper.voteOnFlag(sponsorship, targetOperator, true)
        } else {
            logger.info(`operatorIsNotMalicious, voting NO KICK on, ${targetOperator} on sponsorship ${sponsorship}`)
            await this.voteOnSuspectNodeHelper.voteOnFlag(sponsorship, targetOperator, false)
        }
    }
}

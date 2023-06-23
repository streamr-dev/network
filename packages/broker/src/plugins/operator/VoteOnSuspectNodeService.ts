import { Logger } from '@streamr/utils'
import StreamrClient from 'streamr-client'
import pLimit from 'p-limit'
import { OperatorServiceConfig } from './OperatorPlugin'
import { VoteOnSuspectNodeHelper } from './VoteOnSuspectNodeHelper'
// import { compact } from 'lodash'

export class VoteOnSuspectNodeService {
    private readonly streamrClient: StreamrClient
    private readonly voteOnSuspectNodeHelper: VoteOnSuspectNodeHelper
    private readonly logger: Logger = new Logger(module)
    private readonly concurrencyLimit = pLimit(1)
    // TODO how does the concurrency limit factor in here?

    constructor(streamrClient: StreamrClient, serviceConfig: OperatorServiceConfig) {
        this.streamrClient = streamrClient
        this.voteOnSuspectNodeHelper = new VoteOnSuspectNodeHelper(serviceConfig,
            this.handleNodeInspectionRequest.bind(this))
    }

    async start(): Promise<void> {
        this.logger.info('Starting NodeInspectionService')
        await this.voteOnSuspectNodeHelper.start()
        this.logger.info('Started MaintainTopologyService')
    }

    async stop(): Promise<void> {
        this.voteOnSuspectNodeHelper.stop()
        this.logger.info('stopped')
    }

    // eslint-disable-next-line class-methods-use-this
    async handleNodeInspectionRequest(sponsorship: string, targetOperator: string): Promise<void> {
        this.logger.info(`got node inspection request for target ${targetOperator} on sponsorship ${sponsorship}`)
        //const operatorIsMalicious = this.streamrClient.inspectNodes(sponsorship, targetOperato)
        const operatorIsMalicious = true
        if (operatorIsMalicious) {
            this.logger.info(`operatorIsMalicious, voting KICK on ${targetOperator} on sponsorship ${sponsorship}`)
            await this.voteOnSuspectNodeHelper.voteOnFlag(sponsorship, targetOperator, true)
        } else {
            this.logger.info(`operatorIsNotMalicious, voting NO KICK on, ${targetOperator} on sponsorship ${sponsorship}`)
            await this.voteOnSuspectNodeHelper.voteOnFlag(sponsorship, targetOperator, false)
        }
    }
}

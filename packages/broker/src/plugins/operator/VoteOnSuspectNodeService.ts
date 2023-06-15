import { Logger } from '@streamr/utils'
import StreamrClient from 'streamr-client'
import pLimit from 'p-limit'
import { OperatorServiceConfig } from './OperatorPlugin'
import { VoteOnSuspectNodeHelper } from './VoteOnSuspectNodeHelper'
// import { compact } from 'lodash'

export class VoteOnSuspectNodeService {
    private readonly streamrClient: StreamrClient
    private readonly nodeInspectionHelper: VoteOnSuspectNodeHelper
    private readonly logger: Logger
    private readonly concurrencyLimit = pLimit(1)
    // TODO how does the concurrency limit factor in here?

    constructor(streamrClient: StreamrClient, serviceConfig: OperatorServiceConfig, logger: Logger) {
        this.streamrClient = streamrClient
        this.logger = logger
        this.nodeInspectionHelper = new VoteOnSuspectNodeHelper(serviceConfig, logger as any,
            this.handleNodeInspectionRequest)
    }

    async start(): Promise<void> {
        this.logger.info('Starting NodeInspectionService')
        await this.nodeInspectionHelper.start()
        this.logger.info('Started MaintainTopologyService')
    }

    async stop(): Promise<void> {
        this.nodeInspectionHelper.stop()
        this.logger.info('stopped')
    }

    // eslint-disable-next-line class-methods-use-this
    async handleNodeInspectionRequest(sponsorship: string, targetOperator: string): Promise<void> {
        
        this.logger.info('handleNodeInspectionRequest', { sponsorship, targetOperator })
        //const operatorIsMalicious = this.streamrClient.inspectNodes(sponsorship, targetOperato)
        const operatorIsMalicious = true
        if (operatorIsMalicious) {
            this.logger.info('operatorIsMalicious', { targetOperator })
            await this.nodeInspectionHelper.voteOnFlag(sponsorship, targetOperator, true)
        } else {
            this.logger.info('operatorIsNotMalicious', { targetOperator })
            await this.nodeInspectionHelper.voteOnFlag(sponsorship, targetOperator, false)
        }
    }
}

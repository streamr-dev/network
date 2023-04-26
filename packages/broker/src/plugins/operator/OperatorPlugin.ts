import { Plugin } from '../../Plugin'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'
import { Schema } from 'ajv'
import { AnnounceNodeService } from './AnnounceNodeService'
import { InspectRandomNodeService } from './InspectRandomNodeService'
import { MaintainOperatorContractService } from './MaintainOperatorContractService'
import { MaintainTopologyService } from './MaintainTopologyService'
import { VoteOnSuspectNodeService } from './VoteOnSuspectNodeService'
import { FakeOperatorClient } from './FakeOperatorClient'

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface OperatorPluginConfig {}

export class OperatorPlugin extends Plugin<OperatorPluginConfig> {
    private readonly announceNodeService = new AnnounceNodeService()
    private readonly inspectRandomNodeService = new InspectRandomNodeService()
    private readonly maintainOperatorContractService = new MaintainOperatorContractService()
    private readonly maintainTopologyService = new MaintainTopologyService(this.streamrClient, new FakeOperatorClient([]))
    private readonly voteOnSuspectNodeService = new VoteOnSuspectNodeService()

    async start(): Promise<void> {
        await this.announceNodeService.start()
        await this.inspectRandomNodeService.start()
        await this.maintainOperatorContractService.start()
        await this.maintainTopologyService.start()
        await this.voteOnSuspectNodeService.start()
    }

    async stop(): Promise<void> {
        await this.announceNodeService.stop()
        await this.inspectRandomNodeService.stop()
        await this.maintainOperatorContractService.stop()
        await this.maintainTopologyService.stop()
        await this.voteOnSuspectNodeService.stop()
    }

    // eslint-disable-next-line class-methods-use-this
    override getConfigSchema(): Schema {
        return PLUGIN_CONFIG_SCHEMA
    }
}

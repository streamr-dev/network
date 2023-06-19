import { Plugin, PluginOptions } from '../../Plugin'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'
import { Schema } from 'ajv'
import { AnnounceNodeService } from './AnnounceNodeService'
import { InspectRandomNodeService } from './InspectRandomNodeService'
import { MaintainOperatorContractService } from './MaintainOperatorContractService'
import { MaintainTopologyService } from './MaintainTopologyService'
import { VoteOnSuspectNodeService } from './VoteOnSuspectNodeService'
import { OperatorClient, OperatorClientConfig } from './OperatorClient'
import fetch from 'node-fetch'
import { Logger, toEthereumAddress } from '@streamr/utils'
import { JsonRpcProvider } from '@ethersproject/providers'
import { MaintainOperatorValueService } from './MaintainOperatorValueService'
import { Wallet } from 'ethers'

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface OperatorPluginConfig {
    operatorContractAddress: string
}

const logger = new Logger(module)

export class OperatorPlugin extends Plugin<OperatorPluginConfig> {
    private readonly announceNodeService: AnnounceNodeService
    private readonly inspectRandomNodeService = new InspectRandomNodeService()
    private readonly maintainOperatorContractService = new MaintainOperatorContractService()
    private readonly voteOnSuspectNodeService = new VoteOnSuspectNodeService()
    private readonly maintainTopologyService: MaintainTopologyService
    
    private operatorClientConfig: OperatorClientConfig
    private maintainOperatorValueService: MaintainOperatorValueService

    constructor(options: PluginOptions) {
        super(options)
        const provider = new JsonRpcProvider(this.brokerConfig.client.contracts!.streamRegistryChainRPCs!.rpcs[0].url)
        this.operatorClientConfig = {
            provider,
            operatorContractAddress: this.pluginConfig.operatorContractAddress,
            theGraphUrl: `http://${process.env.STREAMR_DOCKER_DEV_HOST ?? '10.200.10.1'}:8000/subgraphs/name/streamr-dev/network-subgraphs`,
            fetch: fetch,
            signer: Wallet.createRandom().connect(provider)
        }
        this.announceNodeService = new AnnounceNodeService(
            this.streamrClient,
            toEthereumAddress(this.pluginConfig.operatorContractAddress)
        )
        this.maintainTopologyService = new MaintainTopologyService(
            this.streamrClient,
            new OperatorClient(this.operatorClientConfig, logger as any) // TODO: casting?
        )
        this.maintainOperatorValueService = new MaintainOperatorValueService(this.operatorClientConfig)
    }

    async start(): Promise<void> {
        await this.announceNodeService.start()
        await this.inspectRandomNodeService.start()
        await this.maintainOperatorContractService.start()
        await this.maintainOperatorValueService.start()
        await this.maintainTopologyService.start()
        await this.voteOnSuspectNodeService.start()
    }

    async stop(): Promise<void> {
        await this.announceNodeService.stop()
        await this.inspectRandomNodeService.stop()
        await this.maintainOperatorContractService.stop()
        await this.maintainOperatorValueService.stop()
        await this.maintainTopologyService.stop()
        await this.voteOnSuspectNodeService.stop()
    }

    // eslint-disable-next-line class-methods-use-this
    override getConfigSchema(): Schema {
        return PLUGIN_CONFIG_SCHEMA
    }
}

import { Signer } from '@ethersproject/abstract-signer'
import { JsonRpcProvider, Provider } from '@ethersproject/providers'
import { toStreamID } from '@streamr/protocol'
import { EthereumAddress, toEthereumAddress } from '@streamr/utils'
import { Schema } from 'ajv'
import { Wallet } from 'ethers'
import { StreamrClient } from 'streamr-client'
import { Plugin } from '../../Plugin'
import { AnnounceNodeService } from './AnnounceNodeService'
import { InspectRandomNodeService } from './InspectRandomNodeService'
import { MaintainOperatorContractService } from './MaintainOperatorContractService'
import { MaintainOperatorValueService } from './MaintainOperatorValueService'
import { MaintainTopologyService, setUpAndStartMaintainTopologyService } from './MaintainTopologyService'
import { OperatorFleetState } from './OperatorFleetState'
import { VoteOnSuspectNodeService } from './VoteOnSuspectNodeService'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'

export interface OperatorPluginConfig {
    operatorContractAddress: string
    replicationFactor: number
}

export interface OperatorServiceConfig {
    provider: Provider
    signer: Signer
    operatorContractAddress: EthereumAddress
    theGraphUrl: string
}

export class OperatorPlugin extends Plugin<OperatorPluginConfig> {

    private announceNodeService?: AnnounceNodeService
    private inspectRandomNodeService = new InspectRandomNodeService()
    private maintainOperatorContractService = new MaintainOperatorContractService()
    private voteOnSuspectNodeService?: VoteOnSuspectNodeService
    private maintainTopologyService?: MaintainTopologyService
    private maintainOperatorValueService?: MaintainOperatorValueService
    private fleetState?: OperatorFleetState
    private serviceConfig?: OperatorServiceConfig

    async start(streamrClient: StreamrClient): Promise<void> {
        const provider = new JsonRpcProvider(this.brokerConfig.client.contracts!.streamRegistryChainRPCs!.rpcs[0].url)
        this.serviceConfig = {
            provider,
            operatorContractAddress: toEthereumAddress(this.pluginConfig.operatorContractAddress),
            theGraphUrl: `http://${process.env.STREAMR_DOCKER_DEV_HOST ?? '10.200.10.1'}:8000/subgraphs/name/streamr-dev/network-subgraphs`,
            signer: Wallet.createRandom().connect(provider)
        }
        this.announceNodeService = new AnnounceNodeService(
            streamrClient,
            toEthereumAddress(this.pluginConfig.operatorContractAddress)
        )
        this.fleetState = new OperatorFleetState(
            streamrClient,
            toStreamID('/operator/coordination', this.serviceConfig.operatorContractAddress)
        )
        this.maintainOperatorValueService = new MaintainOperatorValueService(this.serviceConfig)
        this.voteOnSuspectNodeService = new VoteOnSuspectNodeService(
            streamrClient,
            this.serviceConfig
        )
        this.maintainTopologyService = await setUpAndStartMaintainTopologyService({
            streamrClient: streamrClient,
            replicationFactor: this.pluginConfig.replicationFactor,
            serviceHelperConfig: this.serviceConfig,
            operatorFleetState: this.fleetState
        })
        await this.announceNodeService.start()
        await this.inspectRandomNodeService.start()
        await this.maintainOperatorContractService.start()
        await this.maintainOperatorValueService.start()
        await this.maintainTopologyService.start()
        await this.voteOnSuspectNodeService.start()

        await this.fleetState.start() // must be started last!
    }

    async stop(): Promise<void> {
        await this.announceNodeService!.stop()
        await this.inspectRandomNodeService.stop()
        await this.maintainOperatorContractService.stop()
        await this.maintainOperatorValueService!.stop()
        await this.voteOnSuspectNodeService!.stop()
    }

    // eslint-disable-next-line class-methods-use-this
    override getConfigSchema(): Schema {
        return PLUGIN_CONFIG_SCHEMA
    }

    // eslint-disable-next-line class-methods-use-this
    override getClientConfig(): { path: string, value: any }[] {
        return [{
            path: "network.node.acceptProxyConnections", value: true
        }]
    }
}

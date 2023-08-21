import { Plugin, PluginOptions } from '../../Plugin'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'
import { Schema } from 'ajv'
import { AnnounceNodeToStreamService } from './AnnounceNodeToStreamService'
import { InspectRandomNodeService } from './InspectRandomNodeService'
import { MaintainOperatorContractService } from './MaintainOperatorContractService'
import { MaintainTopologyService, setUpAndStartMaintainTopologyService } from './MaintainTopologyService'
import { EthereumAddress, Logger, toEthereumAddress } from '@streamr/utils'
import { Provider, JsonRpcProvider } from '@ethersproject/providers'
import { Signer } from '@ethersproject/abstract-signer'
import { Wallet } from 'ethers'
import { VoteOnSuspectNodeService } from './VoteOnSuspectNodeService'
import { MaintainOperatorValueService } from './MaintainOperatorValueService'
import { OperatorValueBreachWatcher } from './OperatorValueBreachWatcher'
import { OperatorFleetState } from './OperatorFleetState'
import { toStreamID } from '@streamr/protocol'
import { AnnounceNodeToContractService } from './AnnounceNodeToContractService'
import { AnnounceNodeToContractHelper } from './AnnounceNodeToContractHelper'
import { CONFIG_TEST } from 'streamr-client'

export const DEFAULT_MAX_SPONSORSHIP_COUNT = 20 // max number of sponsorships to loop over before tx reverts
export const DEFAULT_MIN_SPONSORSHIP_EARNINGS = 1 // token value, not wei

export interface OperatorPluginConfig {
    operatorContractAddress: string
    replicationFactor: number
}

export interface OperatorServiceConfig {
    provider: Provider
    signer: Signer
    operatorContractAddress: EthereumAddress
    theGraphUrl: string
    maxSponsorshipsCount?: number
    minSponsorshipEarnings?: number
}

const logger = new Logger(module)

export class OperatorPlugin extends Plugin<OperatorPluginConfig> {
    private readonly announceNodeToStreamService: AnnounceNodeToStreamService
    private readonly announceNodeToContractService: AnnounceNodeToContractService
    private readonly inspectRandomNodeService = new InspectRandomNodeService()
    private readonly maintainOperatorContractService = new MaintainOperatorContractService()
    private readonly voteOnSuspectNodeService: VoteOnSuspectNodeService
    private maintainTopologyService?: MaintainTopologyService
    private readonly maintainOperatorValueService: MaintainOperatorValueService
    private readonly operatorValueBreachWatcher: OperatorValueBreachWatcher
    private readonly fleetState: OperatorFleetState
    private readonly serviceConfig: OperatorServiceConfig

    constructor(options: PluginOptions) {
        super(options)
        const provider = new JsonRpcProvider(this.brokerConfig.client.contracts!.streamRegistryChainRPCs!.rpcs[0].url)
        this.serviceConfig = {
            provider,
            operatorContractAddress: toEthereumAddress(this.pluginConfig.operatorContractAddress),
            // TODO read from client, as we need to use production value in production environment (not ConfigTest)
            theGraphUrl: CONFIG_TEST.contracts!.theGraphUrl!,
            signer: Wallet.createRandom().connect(provider),
            maxSponsorshipsCount: DEFAULT_MAX_SPONSORSHIP_COUNT,
            minSponsorshipEarnings: DEFAULT_MIN_SPONSORSHIP_EARNINGS
        }
        this.announceNodeToStreamService = new AnnounceNodeToStreamService(
            this.streamrClient,
            toEthereumAddress(this.pluginConfig.operatorContractAddress)
        )
        this.fleetState = new OperatorFleetState(
            this.streamrClient,
            toStreamID('/operator/coordination', this.serviceConfig.operatorContractAddress)
        )
        this.announceNodeToContractService = new AnnounceNodeToContractService(
            this.streamrClient,
            new AnnounceNodeToContractHelper(this.serviceConfig),
            this.fleetState
        )
        this.maintainOperatorValueService = new MaintainOperatorValueService(this.serviceConfig)
        this.operatorValueBreachWatcher = new OperatorValueBreachWatcher(this.serviceConfig)
        this.voteOnSuspectNodeService = new VoteOnSuspectNodeService(
            this.streamrClient,
            this.serviceConfig
        )

    }

    async start(): Promise<void> {
        this.maintainTopologyService = await setUpAndStartMaintainTopologyService({
            streamrClient: this.streamrClient,
            replicationFactor: this.pluginConfig.replicationFactor,
            serviceHelperConfig: this.serviceConfig,
            operatorFleetState: this.fleetState
        })
        await this.announceNodeToStreamService.start()
        await this.inspectRandomNodeService.start()
        await this.maintainOperatorContractService.start()
        await this.maintainOperatorValueService.start()
        await this.maintainTopologyService.start()
        await this.voteOnSuspectNodeService.start()
        await this.operatorValueBreachWatcher.start()
        await this.fleetState.start()
        this.announceNodeToContractService.start().catch((err) => {
            logger.fatal('Encountered fatal error in announceNodeToContractService', { err })
            process.exit(1)
        })
    }

    async stop(): Promise<void> {
        await this.announceNodeToStreamService.stop()
        await this.inspectRandomNodeService.stop()
        await this.maintainOperatorContractService.stop()
        await this.maintainOperatorValueService.stop()
        await this.voteOnSuspectNodeService.stop()
        await this.operatorValueBreachWatcher.stop()
    }

    // eslint-disable-next-line class-methods-use-this
    override getConfigSchema(): Schema {
        return PLUGIN_CONFIG_SCHEMA
    }
}

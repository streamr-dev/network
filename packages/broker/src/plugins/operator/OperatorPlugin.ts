import { JsonRpcProvider } from '@ethersproject/providers'
import { toStreamID } from '@streamr/protocol'
import { EthereumAddress, Logger, toEthereumAddress } from '@streamr/utils'
import { Schema } from 'ajv'
import { Wallet } from 'ethers'
import { CONFIG_TEST } from 'streamr-client'
import { Plugin, PluginOptions } from '../../Plugin'
import { AnnounceNodeToContractHelper } from './AnnounceNodeToContractHelper'
import { AnnounceNodeToContractService } from './AnnounceNodeToContractService'
import { AnnounceNodeToStreamService } from './AnnounceNodeToStreamService'
import { InspectRandomNodeService } from './InspectRandomNodeService'
import { MaintainOperatorContractService } from './MaintainOperatorContractService'
import { MaintainOperatorValueService } from './MaintainOperatorValueService'
import { MaintainTopologyService, setUpAndStartMaintainTopologyService } from './MaintainTopologyService'
import { OperatorValueBreachWatcher } from './OperatorValueBreachWatcher'
import { OperatorFleetState } from './OperatorFleetState'
import { VoteOnSuspectNodeService } from './VoteOnSuspectNodeService'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'

export const DEFAULT_MAX_SPONSORSHIP_IN_WITHDRAW = 20 // max number to loop over before the earnings withdraw tx gets too big and EVM reverts it
export const DEFAULT_MIN_SPONSORSHIP_EARNINGS_IN_WITHDRAW = 1 // token value, not wei

export interface OperatorPluginConfig {
    operatorContractAddress: string
    redundancyFactor: number
}

export interface OperatorServiceConfig {
    nodeWallet: Wallet
    operatorContractAddress: EthereumAddress
    theGraphUrl: string
    maxSponsorshipsInWithdraw?: number
    minSponsorshipEarningsInWithdraw?: number
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
        // TODO read from client, as we need to use production value in production environment (not random address)
        const nodeWallet = Wallet.createRandom().connect(provider)
        this.serviceConfig = {
            nodeWallet,
            operatorContractAddress: toEthereumAddress(this.pluginConfig.operatorContractAddress),
            // TODO read from client, as we need to use production value in production environment (not ConfigTest)
            theGraphUrl: CONFIG_TEST.contracts!.theGraphUrl!,
            maxSponsorshipsInWithdraw: DEFAULT_MAX_SPONSORSHIP_IN_WITHDRAW,
            minSponsorshipEarningsInWithdraw: DEFAULT_MIN_SPONSORSHIP_EARNINGS_IN_WITHDRAW
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
            redundancyFactor: this.pluginConfig.redundancyFactor,
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

    // eslint-disable-next-line class-methods-use-this
    override getClientConfig(): { path: string, value: any }[] {
        return [{
            path: "network.node.acceptProxyConnections", value: true
        }]
    }
}

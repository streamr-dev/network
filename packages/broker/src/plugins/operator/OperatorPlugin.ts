import { toStreamID } from '@streamr/protocol'
import { EthereumAddress, Logger, toEthereumAddress } from '@streamr/utils'
import { Schema } from 'ajv'
import { Signer } from 'ethers'
import StreamrClient, { CONFIG_TEST } from 'streamr-client'
import { Plugin } from '../../Plugin'
import { AnnounceNodeToContractHelper } from './AnnounceNodeToContractHelper'
import { AnnounceNodeToContractService } from './AnnounceNodeToContractService'
import { AnnounceNodeToStreamService } from './AnnounceNodeToStreamService'
import { InspectRandomNodeService } from './InspectRandomNodeService'
import { MaintainOperatorPoolValueService } from './MaintainOperatorPoolValueService'
import { MaintainTopologyService, setUpAndStartMaintainTopologyService } from './MaintainTopologyService'
import { OperatorPoolValueBreachWatcher } from './OperatorPoolValueBreachWatcher'
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
    signer: Signer
    operatorContractAddress: EthereumAddress
    theGraphUrl: string
    maxSponsorshipsInWithdraw?: number
    minSponsorshipEarningsInWithdraw?: number
}

const logger = new Logger(module)

export class OperatorPlugin extends Plugin<OperatorPluginConfig> {
    private announceNodeToStreamService?: AnnounceNodeToStreamService
    private announceNodeToContractService?: AnnounceNodeToContractService
    private inspectRandomNodeService = new InspectRandomNodeService()
    private voteOnSuspectNodeService?: VoteOnSuspectNodeService
    private maintainTopologyService?: MaintainTopologyService
    private maintainOperatorPoolValueService?: MaintainOperatorPoolValueService
    private operatorPoolValueBreachWatcher?: OperatorPoolValueBreachWatcher
    private fleetState?: OperatorFleetState
    private serviceConfig?: OperatorServiceConfig

    async start(streamrClient: StreamrClient): Promise<void> {
        const signer = await streamrClient.getSigner()
        this.serviceConfig = {
            signer,
            operatorContractAddress: toEthereumAddress(this.pluginConfig.operatorContractAddress),
            // TODO read from client, as we need to use production value in production environment (not ConfigTest)
            theGraphUrl: CONFIG_TEST.contracts!.theGraphUrl!,
            maxSponsorshipsInWithdraw: DEFAULT_MAX_SPONSORSHIP_IN_WITHDRAW,
            minSponsorshipEarningsInWithdraw: DEFAULT_MIN_SPONSORSHIP_EARNINGS_IN_WITHDRAW
        }
        this.announceNodeToStreamService = new AnnounceNodeToStreamService(
            streamrClient,
            toEthereumAddress(this.pluginConfig.operatorContractAddress)
        )
        this.fleetState = new OperatorFleetState(
            streamrClient,
            toStreamID('/operator/coordination', this.serviceConfig.operatorContractAddress)
        )
        this.announceNodeToContractService = new AnnounceNodeToContractService(
            streamrClient,
            new AnnounceNodeToContractHelper(this.serviceConfig),
            this.fleetState
        )
        this.maintainOperatorPoolValueService = new MaintainOperatorPoolValueService(this.serviceConfig)
        this.operatorPoolValueBreachWatcher = new OperatorPoolValueBreachWatcher(this.serviceConfig)
        this.voteOnSuspectNodeService = new VoteOnSuspectNodeService(
            streamrClient,
            this.serviceConfig
        )

        this.maintainTopologyService = await setUpAndStartMaintainTopologyService({
            streamrClient,
            redundancyFactor: this.pluginConfig.redundancyFactor,
            serviceHelperConfig: this.serviceConfig,
            operatorFleetState: this.fleetState
        })
        await this.announceNodeToStreamService.start()
        await this.inspectRandomNodeService.start()
        await this.maintainOperatorPoolValueService.start()
        await this.maintainTopologyService.start()
        await this.voteOnSuspectNodeService.start()
        await this.operatorPoolValueBreachWatcher.start()
        await this.fleetState.start()
        this.announceNodeToContractService.start().catch((err) => {
            logger.fatal('Encountered fatal error in announceNodeToContractService', { err })
            process.exit(1)
        })
    }

    async stop(): Promise<void> {
        await this.announceNodeToStreamService!.stop()
        await this.inspectRandomNodeService.stop()
        await this.maintainOperatorPoolValueService!.stop()
        await this.voteOnSuspectNodeService!.stop()
        await this.operatorPoolValueBreachWatcher!.stop()
    }

    // eslint-disable-next-line class-methods-use-this
    override getConfigSchema(): Schema {
        return PLUGIN_CONFIG_SCHEMA
    }

    // eslint-disable-next-line class-methods-use-this
    override getClientConfig(): { path: string, value: any }[] {
        return [{
            path: 'network.node.acceptProxyConnections', value: true
        }]
    }
}

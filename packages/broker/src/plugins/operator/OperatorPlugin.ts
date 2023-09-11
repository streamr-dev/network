import { toStreamID } from '@streamr/protocol'
import { EthereumAddress, Logger, toEthereumAddress } from '@streamr/utils'
import { Schema } from 'ajv'
import { Signer } from 'ethers'
import { CONFIG_TEST, StreamrClient } from 'streamr-client'
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
import { fetchRedundancyFactor } from './fetchRedundancyFactor'

export interface OperatorPluginConfig {
    operatorContractAddress: string
    heartbeatIntervalInMs: number // 1000 * 10
    withdrawParameters: {
        maxSponsorships: number // 20 max number to loop over before the earnings withdraw tx gets too big and EVM reverts it
        minSponsorshipEarnings: number // 1 token value, not wei
    }
    fleetStateParameters: {
        pruneAgeInMs: number // 5 * 60 * 1000
        pruneIntervalInMs: number // 30 * 1000
        latencyExtraInMs: number // 2 * 1000
    }
    announceToContractParameters: {
        writeIntervalInMs: number // 24 * 60 * 60 * 1000
        pollIntervalInMs: number // 10 * 60 * 1000
    }
    maintainOperatorPoolValueParameters: {
        checkValueIntervalInMs: number // 24 * 60 * 60 * 1000
        withdrawLimitSafetyFraction: number // 0.5
    }
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
            maxSponsorshipsInWithdraw: this.pluginConfig.withdrawParameters.maxSponsorships,
            minSponsorshipEarningsInWithdraw: this.pluginConfig.withdrawParameters.minSponsorshipEarnings
        }
        this.announceNodeToStreamService = new AnnounceNodeToStreamService(
            streamrClient,
            toEthereumAddress(this.pluginConfig.operatorContractAddress),
            this.pluginConfig.heartbeatIntervalInMs
        )
        this.fleetState = new OperatorFleetState(
            streamrClient,
            toStreamID('/operator/coordination', this.serviceConfig.operatorContractAddress),
            this.pluginConfig.fleetStateParameters.pruneAgeInMs,
            this.pluginConfig.fleetStateParameters.pruneIntervalInMs,
            this.pluginConfig.fleetStateParameters.latencyExtraInMs,
            this.pluginConfig.heartbeatIntervalInMs
        )
        this.announceNodeToContractService = new AnnounceNodeToContractService(
            streamrClient,
            new AnnounceNodeToContractHelper(this.serviceConfig),
            this.fleetState,
            this.pluginConfig.announceToContractParameters.writeIntervalInMs,
            this.pluginConfig.announceToContractParameters.pollIntervalInMs
        )
        this.maintainOperatorPoolValueService = new MaintainOperatorPoolValueService(
            this.serviceConfig,
            this.pluginConfig.maintainOperatorPoolValueParameters.withdrawLimitSafetyFraction,
            this.pluginConfig.maintainOperatorPoolValueParameters.checkValueIntervalInMs
        )
        this.operatorPoolValueBreachWatcher = new OperatorPoolValueBreachWatcher(this.serviceConfig)
        this.voteOnSuspectNodeService = new VoteOnSuspectNodeService(
            streamrClient,
            this.serviceConfig
        )

        const redundancyFactor = await fetchRedundancyFactor(this.serviceConfig)
        if (redundancyFactor === undefined) {
            throw new Error('Failed to retrieve redundancy factor')
        }
        logger.info('Fetched redundancy factor', { redundancyFactor })

        this.maintainTopologyService = await setUpAndStartMaintainTopologyService({
            streamrClient,
            redundancyFactor,
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

import { toStreamID } from '@streamr/protocol'
import { EthereumAddress, Logger, scheduleAtInterval, setAbortableInterval, toEthereumAddress } from '@streamr/utils'
import { Schema } from 'ajv'
import { Signer } from 'ethers'
import { CONFIG_TEST } from 'streamr-client'
import { Plugin } from '../../Plugin'
import { AnnounceNodeToContractHelper } from './AnnounceNodeToContractHelper'
import { InspectRandomNodeService } from './InspectRandomNodeService'
import { MaintainOperatorPoolValueService } from './MaintainOperatorPoolValueService'
import { MaintainTopologyService, setUpAndStartMaintainTopologyService } from './MaintainTopologyService'
import { OperatorFleetState } from './OperatorFleetState'
import { VoteOnSuspectNodeService } from './VoteOnSuspectNodeService'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'
import { createIsLeaderFn } from './createIsLeaderFn'
import { announceNodeToContract } from './announceNodeToContract'
import { announceNodeToStream } from './announceNodeToStream'
import { checkOperatorPoolValueBreach } from './checkOperatorPoolValueBreach'
import { MaintainOperatorPoolValueHelper } from './MaintainOperatorPoolValueHelper'

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
    private inspectRandomNodeService = new InspectRandomNodeService()
    private voteOnSuspectNodeService?: VoteOnSuspectNodeService
    private maintainTopologyService?: MaintainTopologyService
    private maintainOperatorPoolValueService?: MaintainOperatorPoolValueService
    private fleetState?: OperatorFleetState
    private serviceConfig?: OperatorServiceConfig
    private readonly abortController: AbortController = new AbortController()

    async start(): Promise<void> {
        const signer = await this.streamrClient.getSigner()
        this.serviceConfig = {
            signer,
            operatorContractAddress: toEthereumAddress(this.pluginConfig.operatorContractAddress),
            // TODO read from client, as we need to use production value in production environment (not ConfigTest)
            theGraphUrl: CONFIG_TEST.contracts!.theGraphUrl!,
            maxSponsorshipsInWithdraw: DEFAULT_MAX_SPONSORSHIP_IN_WITHDRAW,
            minSponsorshipEarningsInWithdraw: DEFAULT_MIN_SPONSORSHIP_EARNINGS_IN_WITHDRAW
        }
        this.fleetState = new OperatorFleetState(
            this.streamrClient,
            toStreamID('/operator/coordination', this.serviceConfig.operatorContractAddress)
        )
        this.maintainOperatorPoolValueService = new MaintainOperatorPoolValueService(this.serviceConfig)
        this.voteOnSuspectNodeService = new VoteOnSuspectNodeService(
            this.streamrClient,
            this.serviceConfig
        )

        this.maintainTopologyService = await setUpAndStartMaintainTopologyService({
            streamrClient: this.streamrClient,
            redundancyFactor: this.pluginConfig.redundancyFactor,
            serviceHelperConfig: this.serviceConfig,
            operatorFleetState: this.fleetState
        })
        setAbortableInterval(() => {
            (async () => {
                await announceNodeToStream(
                    toEthereumAddress(this.pluginConfig.operatorContractAddress), 
                    this.streamrClient
                )
            })()
        }, 1000 * 10, this.abortController.signal)
        await this.inspectRandomNodeService.start()
        await this.maintainOperatorPoolValueService.start()
        await this.maintainTopologyService.start()
        await this.voteOnSuspectNodeService.start()
        const maintainOperatorPoolValueHelper = new MaintainOperatorPoolValueHelper(this.serviceConfig)
        const driftLimitFraction = await maintainOperatorPoolValueHelper.getDriftLimitFraction()
        await scheduleAtInterval(
            async () => checkOperatorPoolValueBreach(
                driftLimitFraction,
                maintainOperatorPoolValueHelper
            ).catch((err) => {
                logger.warn('Encountered error', { err })
            }),
            1000 * 60 * 60, // 1 hour
            true,
            this.abortController.signal
        )
        await this.fleetState.start()
        await this.fleetState.waitUntilReady()
        const isLeader = await createIsLeaderFn(this.streamrClient, this.fleetState, logger)
        const announceNodeToContractHelper = new AnnounceNodeToContractHelper(this.serviceConfig!)
        try {
            await scheduleAtInterval(async () => {
                if (isLeader()) {
                    await announceNodeToContract(
                        24 * 60 * 60 * 1000,
                        announceNodeToContractHelper,
                        this.streamrClient
                    )
                }
            }, 10 * 60 * 1000, true, this.abortController.signal)
        } catch (err) {
            logger.fatal('Encountered fatal error in announceNodeToContract', { err })
            process.exit(1)
        }
    }

    async stop(): Promise<void> {
        this.abortController.abort()
        await this.inspectRandomNodeService.stop()
        await this.maintainOperatorPoolValueService!.stop()
        await this.voteOnSuspectNodeService!.stop()
    }

    // eslint-disable-next-line class-methods-use-this
    override getConfigSchema(): Schema {
        return PLUGIN_CONFIG_SCHEMA
    }
}

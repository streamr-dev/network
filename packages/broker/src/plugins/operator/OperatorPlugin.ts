import { toStreamID } from '@streamr/protocol'
import { EthereumAddress, Logger, scheduleAtInterval, setAbortableInterval, toEthereumAddress } from '@streamr/utils'
import { Schema } from 'ajv'
import { Signer } from 'ethers'
import { StreamrClient } from 'streamr-client'
import { Plugin } from '../../Plugin'
import { AnnounceNodeToContractHelper } from './AnnounceNodeToContractHelper'
import { maintainOperatorValue } from './maintainOperatorValue'
import { MaintainTopologyService, setUpAndStartMaintainTopologyService } from './MaintainTopologyService'
import { DEFAULT_UPDATE_INTERVAL_IN_MS, OperatorFleetState } from './OperatorFleetState'
import { inspectSuspectNode } from './inspectSuspectNode'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'
import { createIsLeaderFn } from './createIsLeaderFn'
import { announceNodeToContract } from './announceNodeToContract'
import { announceNodeToStream } from './announceNodeToStream'
import { checkOperatorValueBreach } from './checkOperatorValueBreach'
import { MaintainOperatorValueHelper } from './MaintainOperatorValueHelper'
import { fetchRedundancyFactor } from './fetchRedundancyFactor'
import { VoteOnSuspectNodeHelper } from './VoteOnSuspectNodeHelper'

export const DEFAULT_MAX_SPONSORSHIP_IN_WITHDRAW = 20 // max number to loop over before the earnings withdraw tx gets too big and EVM reverts it
export const DEFAULT_MIN_SPONSORSHIP_EARNINGS_IN_WITHDRAW = 1 // token value, not wei

export interface OperatorPluginConfig {
    operatorContractAddress: string
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
    private maintainTopologyService?: MaintainTopologyService
    private fleetState?: OperatorFleetState
    private serviceConfig?: OperatorServiceConfig
    private readonly abortController: AbortController = new AbortController()

    async start(streamrClient: StreamrClient): Promise<void> {
        const signer = await streamrClient.getSigner()
        this.serviceConfig = {
            signer,
            operatorContractAddress: toEthereumAddress(this.pluginConfig.operatorContractAddress),
            theGraphUrl: streamrClient.getConfig().contracts.theGraphUrl,
            maxSponsorshipsInWithdraw: DEFAULT_MAX_SPONSORSHIP_IN_WITHDRAW,
            minSponsorshipEarningsInWithdraw: DEFAULT_MIN_SPONSORSHIP_EARNINGS_IN_WITHDRAW
        }
        this.fleetState = new OperatorFleetState(
            streamrClient,
            toStreamID('/operator/coordination', this.serviceConfig.operatorContractAddress)
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

        const maintainOperatorValueHelper = new MaintainOperatorValueHelper(this.serviceConfig)
        const announceNodeToContractHelper = new AnnounceNodeToContractHelper(this.serviceConfig)
        await this.fleetState.start()
        // start tasks in background so that operations which take significant amount of time (e.g. fleetState.waitUntilReady())
        // don't block the startup of Broker
        setImmediate(async () => {
            setAbortableInterval(() => {
                (async () => {
                    await announceNodeToStream(
                        toEthereumAddress(this.pluginConfig.operatorContractAddress),
                        streamrClient
                    )
                })()
            }, DEFAULT_UPDATE_INTERVAL_IN_MS, this.abortController.signal)
            await scheduleAtInterval(
                async () => checkOperatorValueBreach(
                    maintainOperatorValueHelper
                ).catch((err) => {
                    logger.warn('Encountered error', { err })
                }),
                1000 * 60 * 60, // 1 hour
                true,
                this.abortController.signal
            )
            await this.fleetState!.waitUntilReady()
            const isLeader = await createIsLeaderFn(streamrClient, this.fleetState!, logger)
            try {
                await scheduleAtInterval(async () => {
                    if (isLeader()) {
                        await announceNodeToContract(
                            24 * 60 * 60 * 1000,
                            announceNodeToContractHelper,
                            streamrClient
                        )
                    }
                }, 60 * 1000, true, this.abortController.signal)
            } catch (err) {
                logger.fatal('Encountered fatal error in announceNodeToContract', { err })
                process.exit(1)
            }
            await scheduleAtInterval(
                async () => {
                    if (isLeader()) {
                        try {
                            await maintainOperatorValue(0.5, maintainOperatorValueHelper)
                        } catch (err) {
                            logger.error('Encountered error while checking earnings', { err })
                        }
                    }
                },
                1000 * 60 * 60 * 24, // 1 day
                true,
                this.abortController.signal
            )

            await scheduleAtInterval(async () => {
                try {
                    /*await inspectRandomNode(
                        this.serviceConfig!.operatorContractAddress,
                        new InspectRandomNodeHelper(this.serviceConfig!),
                        undefind as any, TODO: make loadbalacner accessible
                        streamrClient,
                        this.heartbeatTimeoutInMs,
                        (operatorContractAddress) => fetchRedundancyFactor({
                            operatorContractAddress,
                            signer
                        }),
                        this.abortController.signal
                    )*/
                } catch (err) {
                    logger.error('Encountered error while inspecting random node', { err })
                }
            }, 15 * 60 * 1000, false, this.abortController.signal)

            const voteOnSuspectNodeHelper = new VoteOnSuspectNodeHelper(this.serviceConfig!)
            voteOnSuspectNodeHelper.addReviewRequestListener(async (sponsorship, targetOperator, partition) => {
                if (isLeader()) {
                    await inspectSuspectNode(
                        sponsorship,
                        targetOperator,
                        partition,
                        voteOnSuspectNodeHelper,
                        streamrClient,
                        this.abortController.signal,
                        (operatorContractAddress) => fetchRedundancyFactor({
                            operatorContractAddress,
                            signer
                        })
                    )
                }
            }, this.abortController.signal)
        })
    }

    async stop(): Promise<void> {
        this.abortController.abort()
        await this.fleetState!.destroy()
        //await this.inspectRandomNodeService.stop()
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

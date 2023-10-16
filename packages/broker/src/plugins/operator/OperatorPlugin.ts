import { EthereumAddress, Logger, scheduleAtInterval, setAbortableInterval, toEthereumAddress } from '@streamr/utils'
import { Schema } from 'ajv'
import { Signer } from 'ethers'
import { StreamrClient } from 'streamr-client'
import { Plugin } from '../../Plugin'
import { maintainOperatorValue } from './maintainOperatorValue'
import { MaintainTopologyService } from './MaintainTopologyService'
import { OperatorFleetState } from './OperatorFleetState'
import { inspectSuspectNode } from './inspectSuspectNode'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'
import { createIsLeaderFn } from './createIsLeaderFn'
import { announceNodeToContract } from './announceNodeToContract'
import { announceNodeToStream } from './announceNodeToStream'
import { checkOperatorValueBreach } from './checkOperatorValueBreach'
import { fetchRedundancyFactor } from './fetchRedundancyFactor'
import { formCoordinationStreamId } from './formCoordinationStreamId'
import { StreamPartAssignments } from './StreamPartAssignments'
import { MaintainTopologyHelper } from './MaintainTopologyHelper'
import { inspectRandomNode } from './inspectRandomNode'
import { ContractFacade } from './ContractFacade'

export interface OperatorPluginConfig {
    operatorContractAddress: string
    heartbeatUpdateIntervalInMs: number // 10 secs
    fleetState: {
        pruneAgeInMs: number // 5 mins
        pruneIntervalInMs: number // 30 secs
        latencyExtraInMs: number // 2 secs
    }
    checkOperatorValueBreachIntervalInMs: number // 1 hour
    announceNodeToContract: {
        pollIntervalInMs: number // 10 mins
        writeIntervalInMs: number // 24 hours
    }
    maintainOperatorValue: {
        intervalInMs: number // 1 hour
        withdrawLimitSafetyFraction: number // 0.5
        minSponsorshipEarningsInWithdraw: number // 1
        maxSponsorshipsInWithdraw: number // 20
    }
    inspectRandomNode: {
        intervalInMs: number // 15 mins
        heartbeatTimeoutInMs: number // 2 mins
    }
}

export interface OperatorServiceConfig {
    signer: Signer
    operatorContractAddress: EthereumAddress
    theGraphUrl: string
}

const logger = new Logger(module)

export class OperatorPlugin extends Plugin<OperatorPluginConfig> {
    private readonly abortController: AbortController = new AbortController()

    async start(streamrClient: StreamrClient): Promise<void> {
        const signer = await streamrClient.getSigner()
        const nodeId = await streamrClient.getNodeId()
        const operatorContractAddress = toEthereumAddress(this.pluginConfig.operatorContractAddress)
        const serviceConfig = {
            signer,
            operatorContractAddress,
            theGraphUrl: streamrClient.getConfig().contracts.theGraphUrl
        }

        const redundancyFactor = await fetchRedundancyFactor(serviceConfig)
        if (redundancyFactor === undefined) {
            throw new Error('Failed to retrieve redundancy factor')
        }
        logger.info('Fetched redundancy factor', { redundancyFactor })

        const extendConfig = {
            ...serviceConfig,
            minSponsorshipEarningsInWithdraw: this.pluginConfig.maintainOperatorValue.minSponsorshipEarningsInWithdraw,
            maxSponsorshipsInWithdraw: this.pluginConfig.maintainOperatorValue.maxSponsorshipsInWithdraw
        }
        const contractFacade = ContractFacade.createInstance(extendConfig)
        const maintainTopologyHelper = new MaintainTopologyHelper(extendConfig)
        const createOperatorFleetState = OperatorFleetState.createOperatorFleetStateBuilder(
            streamrClient,
            this.pluginConfig.heartbeatUpdateIntervalInMs,
            this.pluginConfig.fleetState.pruneAgeInMs,
            this.pluginConfig.fleetState.pruneIntervalInMs,
            this.pluginConfig.fleetState.latencyExtraInMs
        )

        const fleetState = createOperatorFleetState(formCoordinationStreamId(operatorContractAddress))
        const streamPartAssignments = new StreamPartAssignments(
            nodeId,
            redundancyFactor,
            async (streamId) => {
                const stream = await streamrClient.getStream(streamId)
                return stream.getStreamParts()
            },
            fleetState,
            maintainTopologyHelper
        )

        // Important: must be created before maintainTopologyHelper#start is invoked!
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const maintainTopologyService = new MaintainTopologyService(streamrClient, streamPartAssignments)
        await fleetState.start()
        await maintainTopologyHelper.start()

        this.abortController.signal.addEventListener('abort', async () => {
            await fleetState.destroy()
        })

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
            }, this.pluginConfig.heartbeatUpdateIntervalInMs, this.abortController.signal)
            await scheduleAtInterval(
                async () => checkOperatorValueBreach(
                    contractFacade
                ).catch((err) => {
                    logger.warn('Encountered error', { err })
                }),
                this.pluginConfig.checkOperatorValueBreachIntervalInMs,
                true,
                this.abortController.signal
            )
            await fleetState!.waitUntilReady()
            const isLeader = await createIsLeaderFn(streamrClient, fleetState!, logger)
            try {
                await scheduleAtInterval(async () => {
                    if (isLeader()) {
                        await announceNodeToContract(
                            this.pluginConfig.announceNodeToContract.writeIntervalInMs,
                            contractFacade,
                            streamrClient
                        )
                    }
                }, this.pluginConfig.announceNodeToContract.pollIntervalInMs, true, this.abortController.signal)
            } catch (err) {
                logger.fatal('Encountered fatal error in announceNodeToContract', { err })
                process.exit(1)
            }
            await scheduleAtInterval(
                async () => {
                    if (isLeader()) {
                        try {
                            await maintainOperatorValue(
                                this.pluginConfig.maintainOperatorValue.withdrawLimitSafetyFraction,
                                contractFacade
                            )
                        } catch (err) {
                            logger.error('Encountered error while checking earnings', { err })
                        }
                    }
                },
                this.pluginConfig.maintainOperatorValue.intervalInMs,
                true,
                this.abortController.signal
            )

            await scheduleAtInterval(async () => {
                try {
                    await inspectRandomNode(
                        operatorContractAddress,
                        contractFacade,
                        streamPartAssignments,
                        streamrClient,
                        this.pluginConfig.inspectRandomNode.heartbeatTimeoutInMs,
                        (operatorContractAddress) => fetchRedundancyFactor({
                            operatorContractAddress,
                            signer
                        }),
                        createOperatorFleetState,
                        this.abortController.signal
                    )
                } catch (err) {
                    logger.error('Encountered error while inspecting random node', { err })
                }
            }, this.pluginConfig.inspectRandomNode.intervalInMs, false, this.abortController.signal)

            contractFacade.addReviewRequestListener(async (sponsorship, targetOperator, partition) => {
                if (isLeader()) {
                    await inspectSuspectNode(
                        sponsorship,
                        targetOperator,
                        partition,
                        contractFacade,
                        streamrClient,
                        this.abortController.signal,
                        (operatorContractAddress) => fetchRedundancyFactor({
                            operatorContractAddress,
                            signer
                        }),
                        createOperatorFleetState
                    )
                }
            }, this.abortController.signal)
        })
    }

    async stop(): Promise<void> {
        this.abortController.abort()
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

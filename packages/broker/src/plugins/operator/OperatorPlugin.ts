import { EthereumAddress, Logger, scheduleAtInterval, setAbortableInterval, toEthereumAddress } from '@streamr/utils'
import { Schema } from 'ajv'
import { StreamrClient, SignerWithProvider } from 'streamr-client'
import { Plugin } from '../../Plugin'
import { maintainOperatorValue } from './maintainOperatorValue'
import { MaintainTopologyService } from './MaintainTopologyService'
import { OperatorFleetState } from './OperatorFleetState'
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
import { reviewSuspectNode } from './reviewSuspectNode'
import { inspectOverTime } from './inspectOverTime'
import { toStreamPartID } from '@streamr/protocol'
import random from 'lodash/random'

export interface OperatorPluginConfig {
    operatorContractAddress: string
    heartbeatUpdateIntervalInMs: number
    heartbeatTimeoutInMs: number
    fleetState: {
        pruneAgeInMs: number
        pruneIntervalInMs: number
        latencyExtraInMs: number
        warmupPeriodInMs: number
    }
    checkOperatorValueBreachIntervalInMs: number
    announceNodeToContract: {
        pollIntervalInMs: number
        writeIntervalInMs: number
    }
    maintainOperatorValue: {
        intervalInMs: number
        withdrawLimitSafetyFraction: number
        minSponsorshipEarningsInWithdraw: number
        maxSponsorshipsInWithdraw: number
    }
    inspectRandomNode: {
        intervalInMs: number
    }
}

export interface OperatorServiceConfig {
    signer: SignerWithProvider
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
            throw new Error('Failed to fetch my redundancy factor')
        }
        logger.info('Fetched my redundancy factor', { redundancyFactor })

        const contractFacade = ContractFacade.createInstance(serviceConfig)
        const maintainTopologyHelper = new MaintainTopologyHelper(serviceConfig)
        const createOperatorFleetState = OperatorFleetState.createOperatorFleetStateBuilder(
            streamrClient,
            this.pluginConfig.heartbeatUpdateIntervalInMs,
            this.pluginConfig.fleetState.pruneAgeInMs,
            this.pluginConfig.fleetState.pruneIntervalInMs,
            this.pluginConfig.fleetState.latencyExtraInMs,
            this.pluginConfig.fleetState.warmupPeriodInMs
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
                    contractFacade,
                    this.pluginConfig.maintainOperatorValue.minSponsorshipEarningsInWithdraw,
                    this.pluginConfig.maintainOperatorValue.maxSponsorshipsInWithdraw
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
                                this.pluginConfig.maintainOperatorValue.minSponsorshipEarningsInWithdraw,
                                this.pluginConfig.maintainOperatorValue.maxSponsorshipsInWithdraw,
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
                        this.pluginConfig.heartbeatTimeoutInMs,
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

            contractFacade.addReviewRequestListener(async (
                sponsorshipAddress,
                targetOperator,
                partition,
                votingPeriodStartTimestamp,
                votingPeriodEndTimestamp
            ) => {
                try {
                    if (isLeader()) {
                        await reviewSuspectNode({
                            sponsorshipAddress,
                            targetOperator,
                            partition,
                            contractFacade,
                            streamrClient,
                            createOperatorFleetState,
                            getRedundancyFactor: (operatorContractAddress) => fetchRedundancyFactor({
                                operatorContractAddress,
                                signer
                            }),
                            maxSleepTime: 5 * 60 * 1000,
                            heartbeatTimeoutInMs: this.pluginConfig.heartbeatTimeoutInMs,
                            votingPeriod: {
                                startTime: votingPeriodStartTimestamp,
                                endTime: votingPeriodEndTimestamp
                            },
                            inspectionIntervalInMs: 8 * 60 * 1000,
                            maxInspections: 10,
                            abortSignal: this.abortController.signal
                        })
                    }
                } catch (err) {
                    logger.error('Encountered error while processing review request', { err })
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

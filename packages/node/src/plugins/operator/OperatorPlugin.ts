import { ReviewRequestEvent, SignerWithProvider, StreamrClient } from '@streamr/sdk'
import {
    addManagedEventListener,
    Cache,
    EthereumAddress,
    Logger,
    scheduleAtInterval,
    setAbortableInterval,
    StreamPartID,
    toEthereumAddress
} from '@streamr/utils'
import { Schema } from 'ajv'
import { Overrides } from 'ethers'
import { Plugin } from '../../Plugin'
import { MaintainTopologyHelper } from './MaintainTopologyHelper'
import { MaintainTopologyService } from './MaintainTopologyService'
import { OperatorFleetState } from './OperatorFleetState'
import { StreamPartAssignments } from './StreamPartAssignments'
import { announceNodeToContract } from './announceNodeToContract'
import { announceNodeToStream } from './announceNodeToStream'
import { checkOperatorValueBreach } from './checkOperatorValueBreach'
import { closeExpiredFlags } from './closeExpiredFlags'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'
import { createIsLeaderFn } from './createIsLeaderFn'
import { formCoordinationStreamId } from './formCoordinationStreamId'
import { inspectRandomNode } from './inspectRandomNode'
import { maintainOperatorValue } from './maintainOperatorValue'
import { reviewSuspectNode } from './reviewSuspectNode'

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
        maxInspectionCount: number
    }
    reviewSuspectNode: {
        maxInspectionCount: number
        maxDelayBeforeFirstInspectionInMs: number
    }
    closeExpiredFlags: {
        intervalInMs: number
        maxAgeInMs: number
    }
}

export interface OperatorServiceConfig {
    signer: SignerWithProvider
    operatorContractAddress: EthereumAddress
    theGraphUrl: string
    getEthersOverrides: () => Promise<Overrides>
}

const STAKED_OPERATORS_CACHE_MAX_AGE = 2 * 24 * 60 * 60 * 1000

const logger = new Logger(module)

export class OperatorPlugin extends Plugin<OperatorPluginConfig> {
    private readonly abortController: AbortController = new AbortController()

    async start(streamrClient: StreamrClient): Promise<void> {
        const nodeId = await streamrClient.getNodeId()
        const operatorContractAddress = toEthereumAddress(this.pluginConfig.operatorContractAddress)

        const operator = streamrClient.getOperator(operatorContractAddress)
        const redundancyFactor = await operator.fetchRedundancyFactor()
        if (redundancyFactor === undefined) {
            throw new Error('Failed to fetch my redundancy factor')
        }
        logger.info('Fetched my redundancy factor', { redundancyFactor })

        const maintainTopologyHelper = new MaintainTopologyHelper(operator)
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

        await streamrClient.getNode().registerOperator({
            getAssignedNodesForStreamPart: (streamPartId: StreamPartID) =>
                streamPartAssignments.getAssignedNodesForStreamPart(streamPartId)
        })

        this.abortController.signal.addEventListener('abort', async () => {
            await fleetState.destroy()
        })

        // start tasks in background so that operations which take significant amount of time (e.g. fleetState.waitUntilReady())
        // don't block the startup of Broker
        setImmediate(async () => {
            setAbortableInterval(
                () => {
                    ;(async () => {
                        await announceNodeToStream(
                            toEthereumAddress(this.pluginConfig.operatorContractAddress),
                            streamrClient
                        )
                    })()
                },
                this.pluginConfig.heartbeatUpdateIntervalInMs,
                this.abortController.signal
            )

            await fleetState.waitUntilReady()
            const isLeader = await createIsLeaderFn(streamrClient, fleetState, logger)

            try {
                await scheduleAtInterval(
                    async () => {
                        if (isLeader()) {
                            await announceNodeToContract(
                                this.pluginConfig.announceNodeToContract.writeIntervalInMs,
                                operator,
                                streamrClient
                            )
                        }
                    },
                    this.pluginConfig.announceNodeToContract.pollIntervalInMs,
                    true,
                    this.abortController.signal
                )
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
                                BigInt(this.pluginConfig.maintainOperatorValue.minSponsorshipEarningsInWithdraw),
                                this.pluginConfig.maintainOperatorValue.maxSponsorshipsInWithdraw,
                                operator
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

            await scheduleAtInterval(
                async () => {
                    try {
                        await inspectRandomNode(
                            operatorContractAddress,
                            operator,
                            streamPartAssignments,
                            streamrClient,
                            this.pluginConfig.heartbeatTimeoutInMs,
                            this.pluginConfig.inspectRandomNode.maxInspectionCount,
                            async (targetOperatorContractAddress) => {
                                return streamrClient.getOperator(targetOperatorContractAddress).fetchRedundancyFactor()
                            },
                            createOperatorFleetState,
                            this.abortController.signal
                        )
                    } catch (err) {
                        logger.error('Encountered error while inspecting random node', { err })
                    }
                },
                this.pluginConfig.inspectRandomNode.intervalInMs,
                false,
                this.abortController.signal
            )

            await scheduleAtInterval(
                async () => {
                    try {
                        await closeExpiredFlags(this.pluginConfig.closeExpiredFlags.maxAgeInMs, operator)
                    } catch (err) {
                        logger.error('Encountered error while closing expired flags', { err })
                    }
                },
                this.pluginConfig.closeExpiredFlags.intervalInMs,
                false,
                this.abortController.signal
            )

            const stakedOperatorsCache = new Cache(() => operator.getStakedOperators(), STAKED_OPERATORS_CACHE_MAX_AGE)
            await scheduleAtInterval(
                async () =>
                    checkOperatorValueBreach(
                        operator,
                        streamrClient,
                        () => stakedOperatorsCache.get(),
                        BigInt(this.pluginConfig.maintainOperatorValue.minSponsorshipEarningsInWithdraw),
                        this.pluginConfig.maintainOperatorValue.maxSponsorshipsInWithdraw
                    ).catch((err) => {
                        logger.warn('Encountered error', { err })
                    }),
                this.pluginConfig.checkOperatorValueBreachIntervalInMs,
                false,
                this.abortController.signal
            )

            addManagedEventListener(
                operator,
                'reviewRequested',
                (event: ReviewRequestEvent): void => {
                    setImmediate(async () => {
                        try {
                            if (isLeader()) {
                                await reviewSuspectNode({
                                    sponsorshipAddress: event.sponsorship,
                                    targetOperator: event.targetOperator,
                                    partition: event.partition,
                                    myOperator: operator,
                                    streamrClient,
                                    createOperatorFleetState,
                                    getRedundancyFactor: async (targetOperatorContractAddress) => {
                                        return streamrClient
                                            .getOperator(targetOperatorContractAddress)
                                            .fetchRedundancyFactor()
                                    },
                                    maxDelayBeforeFirstInspectionInMs:
                                        this.pluginConfig.reviewSuspectNode.maxDelayBeforeFirstInspectionInMs,
                                    heartbeatTimeoutInMs: this.pluginConfig.heartbeatTimeoutInMs,
                                    votingPeriod: {
                                        startTime: event.votingPeriodStartTimestamp,
                                        endTime: event.votingPeriodEndTimestamp
                                    },
                                    inspectionIntervalInMs: 8 * 60 * 1000,
                                    maxInspectionCount: this.pluginConfig.reviewSuspectNode.maxInspectionCount,
                                    abortSignal: this.abortController.signal
                                })
                            }
                        } catch (err) {
                            logger.error('Encountered error while processing review request', { err })
                        }
                    })
                },
                this.abortController.signal
            )
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
    override getClientConfig(): { path: string; value: any }[] {
        return [
            {
                path: 'network.node.acceptProxyConnections',
                value: true
            }
        ]
    }
}

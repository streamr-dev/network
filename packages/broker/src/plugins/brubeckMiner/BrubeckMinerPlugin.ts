import fetchNatType from 'nat-type-identifier'
import { Logger, scheduleAtInterval, withTimeout } from '@streamr/utils'
import { wait } from '@streamr/utils'
import { Plugin, PluginOptions } from '../../Plugin'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'
import { Response } from 'node-fetch'
import { fetchOrThrow } from '../../helpers/fetchOrThrow'
import { version as CURRENT_VERSION } from '../../../package.json'
import { Schema } from 'ajv'
import { StreamID, toStreamID, toStreamPartID } from '@streamr/protocol'

const REWARD_STREAM_PARTITION = 0
const LATENCY_POLL_INTERVAL = 30 * 60 * 1000
const NAT_ANALYSIS_SAMPLE_COUNT = 5
const NAT_ANALYSIS_TIMEOUT = {
    maxWaitTime: 60 * 1000
}
const NAT_TYPE_UNKNOWN = 'Unknown'

const logger = new Logger(module)

export interface BrubeckMinerPluginConfig {
    rewardStreamIds: string
    claimServerUrl: string
    maxClaimDelay: number
    stunServerHost: string | null
    beneficiaryAddress?: string
}

interface Peer {
    id: string
    rtt: number | undefined
}

export class BrubeckMinerPlugin extends Plugin<BrubeckMinerPluginConfig> {

    latestLatency?: number
    natType?: string
    dummyMessagesReceived: number
    subscriptionRetryInterval: number
    abortController: AbortController
    streamId: StreamID

    constructor(options: PluginOptions) {
        super(options)
        this.dummyMessagesReceived = 0
        this.subscriptionRetryInterval = 3 * 60 * 1000
        this.abortController = new AbortController()
        this.streamId = toStreamID(this.pluginConfig.rewardStreamIds[Math.floor(Math.random() * this.pluginConfig.rewardStreamIds.length)])
    }

    async start(): Promise<void> {
        await scheduleAtInterval(async () => {
            this.latestLatency = await this.getLatency()
        }, LATENCY_POLL_INTERVAL, true, this.abortController.signal)
        if (this.pluginConfig.stunServerHost !== null) {
            this.natType = await this.getNatType()
        }
        const node = await this.streamrClient.getNode()
        node.setExtraMetadata({
            natType: this.natType || null,
            brokerVersion: CURRENT_VERSION,
        })

        await this.subscribe()

        await scheduleAtInterval(
            () => this.subscriptionIntervalFn(),
            this.subscriptionRetryInterval,
            false,
            this.abortController.signal
        )

        logger.info('Started Brubeck miner plugin')
    }

    private async onRewardCodeReceived(rewardCode: string): Promise<void> {
        logger.info('Received reward code', { rewardCode })
        const peers = await this.getPeers()
        const delay = Math.floor(Math.random() * this.pluginConfig.maxClaimDelay)
        await wait(delay) 
        await this.claimRewardCode(rewardCode, peers, delay)
    }

    private async subscriptionIntervalFn(): Promise<void> {
        const isAlreadySubscribed = (await this.streamrClient!.getSubscriptions(this.streamId)).length > 0
        if (!isAlreadySubscribed) {
            try {
                await this.subscribe()
            } catch (err) {
                logger.warn(`Failed to (re-)subscribe to reward stream (retrying in ${this.subscriptionRetryInterval / 1000} seconds)`, {
                    reason: err?.message,
                    rewardStreamId: this.streamId
                })
            }
        }
    }

    private async subscribe(): Promise<void> {
        const subscription = await this.streamrClient!.subscribe(this.streamId, (message: any) => {
            if (message.rewardCode) {
                this.onRewardCodeReceived(message.rewardCode)
            } if (message.info) {
                logger.info(`Received notification: ${message.info}`)
            } else {
                logger.trace('Received dummy message', {
                    dummyMessageNo: this.dummyMessagesReceived,
                    message
                })
                this.dummyMessagesReceived += 1
            }
        })
        subscription.on('error', (err) => {
            logger.warn('Failed to claim reward code', {
                reason: err?.message,
                rewardStreamId: this.streamId
            })
        })
    }

    private async getPeers(): Promise<Peer[]> {
        const networkNode = await this.streamrClient.getNode()
        const neighbors = networkNode.getNeighborsForStreamPart(toStreamPartID(this.streamId, REWARD_STREAM_PARTITION))
        return neighbors.map((nodeId: string) => ({
            id: nodeId,
            rtt: networkNode.getRtt(nodeId)
        }))
    }

    private async claimRewardCode(rewardCode: string, peers: Peer[], delay: number): Promise<void> {
        const nodeId = (await this.streamrClient.getNode()).getNodeId()
        const body = {
            rewardCode,
            nodeAddress: nodeId,
            streamId: this.streamId,
            clientServerLatency: this.latestLatency,
            waitTime: delay,
            natType: this.natType,
            beneficiaryAddress: this.pluginConfig.beneficiaryAddress ?? null,
            peers
        }
        try {
            const res: Response = await fetchOrThrow(`${this.pluginConfig.claimServerUrl}/claim`, {
                body: JSON.stringify(body),
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            })
            const resBody = await res.json()
            logger.info('Claimed successfully', {
                currentStake: resBody.stake,
                latestBlock: resBody.latestBlock
            })
            if (resBody.alert) {
                logger.info(`Received claim alert: ${resBody.alert}`)
            }
        } catch (err) {
            logger.error('Unable to claim reward', {
                rewardCode,
                err
            })
        }
    }

    private async getLatency(): Promise<number | undefined> {
        const startTime = Date.now()
        try {
            await fetchOrThrow(`${this.pluginConfig.claimServerUrl}/ping`)
            return Date.now() - startTime
        } catch (e) {
            logger.info('Unable to analyze latency')
            return undefined
        }
    }

    private async getNatType(): Promise<string> {
        logger.info('Analyzing NAT type')
        try {
            const result = await withTimeout(fetchNatType({ 
                logsEnabled: false,
                sampleCount: NAT_ANALYSIS_SAMPLE_COUNT,
                stunHost: this.pluginConfig.stunServerHost!
            }), NAT_ANALYSIS_TIMEOUT.maxWaitTime)
            logger.info('Analyzed NAT type', { result })
            return result
        } catch (e) {
            logger.warn('Unable to analyze NAT type', { reason: e.message })
            return NAT_TYPE_UNKNOWN
        }
    }

    async stop(): Promise<void> {
        this.abortController.abort()
    }

    // eslint-disable-next-line class-methods-use-this
    override getConfigSchema(): Schema {
        return PLUGIN_CONFIG_SCHEMA
    }
}

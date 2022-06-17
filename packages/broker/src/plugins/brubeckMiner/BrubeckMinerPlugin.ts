import fetchNatType from 'nat-type-identifier'
import { scheduleAtInterval } from 'streamr-network'
import { Logger, withTimeout } from '@streamr/utils'
import { wait } from 'streamr-test-utils'
import { Plugin, PluginOptions } from '../../Plugin'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'
import { Response } from 'node-fetch'
import { fetchOrThrow } from '../../helpers/fetchOrThrow'
import { version as CURRENT_VERSION } from '../../../package.json'
import { Schema } from 'ajv'
import { StreamID, toStreamID, toStreamPartID } from 'streamr-client-protocol'

const REWARD_STREAM_PARTITION = 0
const LATENCY_POLL_INTERVAL = 30 * 60 * 1000
const NAT_ANALYSIS_SAMPLE_COUNT = 5
const NAT_ANALYSIS_TIMEOUT = {
    maxWaitTime: 60 * 1000,
    errorCode: 'NAT_ANALYSIS_TIMEOUT'
}
const NAT_TYPE_UNKNOWN = 'Unknown'

const logger = new Logger(module)

export interface BrubeckMinerPluginConfig {
    rewardStreamIds: string
    claimServerUrl: string
    maxClaimDelay: number
    stunServerHost: string|null
}

interface Peer {
    id: string
    rtt: number|undefined
}

export class BrubeckMinerPlugin extends Plugin<BrubeckMinerPluginConfig> {

    latestLatency?: number
    latencyPoller?: { stop: () => void }
    natType?: string
    dummyMessagesReceived: number
    rewardSubscriptionRetryRef: NodeJS.Timeout | null
    subscriptionRetryInterval: number
    streamId: StreamID

    constructor(options: PluginOptions) {
        super(options)
        this.dummyMessagesReceived = 0
        this.rewardSubscriptionRetryRef = null
        this.subscriptionRetryInterval = 3 * 60 * 1000
        this.streamId = toStreamID(this.pluginConfig.rewardStreamIds[Math.floor(Math.random()*this.pluginConfig.rewardStreamIds.length)])
    }

    async start(): Promise<void> {
        this.latencyPoller = await scheduleAtInterval(async () => {
            this.latestLatency = await this.getLatency()
        }, LATENCY_POLL_INTERVAL, true)
        if (this.pluginConfig.stunServerHost !== null) {
            this.natType = await this.getNatType()
        }
        const node = await this.streamrClient.getNode()
        node.setExtraMetadata({
            natType: this.natType || null,
            brokerVersion: CURRENT_VERSION,
        })

        await this.subscribe()

        this.rewardSubscriptionRetryRef = setTimeout(() => this.subscriptionIntervalFn(), this.subscriptionRetryInterval)

        logger.info('Brubeck miner plugin started')
    }

    private async onRewardCodeReceived(rewardCode: string): Promise<void> {
        logger.info(`Reward code received: ${rewardCode}`)
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
                logger.warn(`Subscription retry failed, retrying in ${this.subscriptionRetryInterval / 1000} seconds`)
            }
        }
        this.rewardSubscriptionRetryRef = setTimeout(() => this.subscriptionIntervalFn(), this.subscriptionRetryInterval)
    }

    private async subscribe(): Promise<void> {
        const subscription = await this.streamrClient!.subscribe(this.streamId, (message: any) => {
            if (message.rewardCode) {
                this.onRewardCodeReceived(message.rewardCode)
            } if (message.info) {
                logger.info(message.info)
            } else {
                logger.trace(`Dummy message (#${this.dummyMessagesReceived}) received: ${message}`)
                this.dummyMessagesReceived += 1
            }
        })
        subscription.on('error', (err) => {
            logger.warn('Failed to claim reward code due to error %s', err?.message)
            logger.debug('', err)
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
            logger.info(`Reward claimed successfully, current stake ${resBody.stake} on block ${resBody.latestBlock}`)
            if (resBody.alert) {
                logger.info(`Claim alert: ${resBody.alert}`)
            }
        } catch (e) {
            logger.error(`Unable to claim reward: code=${rewardCode}`, e)
        }
    }

    private async getLatency(): Promise<number|undefined> {
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
            }), NAT_ANALYSIS_TIMEOUT.maxWaitTime, NAT_ANALYSIS_TIMEOUT.errorCode)
            logger.info(`NAT type: ${result}`)
            return result
        } catch (e) {
            logger.warn(`Unable to analyze NAT type: ${e.message}`)
            return NAT_TYPE_UNKNOWN
        }
    }

    async stop(): Promise<void> {
        this.latencyPoller?.stop()
        if (this.rewardSubscriptionRetryRef) {
            clearTimeout(this.rewardSubscriptionRetryRef)
            this.rewardSubscriptionRetryRef = null
        }
    }

    getConfigSchema(): Schema {
        return PLUGIN_CONFIG_SCHEMA
    }
}

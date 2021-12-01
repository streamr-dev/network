import { Plugin, PluginOptions } from '../../Plugin'
import { Logger, Protocol } from 'streamr-network'

type ConfigStream = {
    streamId: string,
    streamPartition: number
}

export interface SubscriberPluginConfig {
    streams: ConfigStream[],
    subscriptionRetryInterval: number
}

const logger = new Logger(module)

export class SubscriberPlugin extends Plugin<SubscriberPluginConfig> {

    private readonly SPIDs: Protocol.SPID[]
    private readonly subscriptionRetryInterval: number
    private subscriptionIntervalRef: NodeJS.Timeout | null

    constructor(options: PluginOptions) {
        super(options)
        if (this.streamrClient === undefined) {
            throw new Error('StreamrClient is not available')
        }
        this.SPIDs = this.pluginConfig.streams.map((stream) => {
            return new Protocol.SPID(stream.streamId, stream.streamPartition)
        })
        this.subscriptionRetryInterval = this.pluginConfig.subscriptionRetryInterval
        this.subscriptionIntervalRef = null
    }

    private async subscribeToStreams(): Promise<void> {
        await Promise.all([
            ...this.SPIDs.map(async (spid) => {
                if (this.streamrClient!.getSubscriptions(spid).length === 0) {
                    await this.streamrClient!.subscribe(spid, (_message: any) => {})
                }
            })
        ])
    }

    private async subscriptionIntervalFn(): Promise<void> {
        if (this.streamrClient) {
            try {
                await this.subscribeToStreams()
            } catch (err) {
                logger.warn(`Subscription retry failed, retrying in ${this.subscriptionRetryInterval / 1000} seconds`)
            }
        }
        this.subscriptionIntervalRef = setTimeout(() => this.subscriptionIntervalFn(), this.subscriptionRetryInterval)
    }

    async start(): Promise<void> {
        await this.subscribeToStreams()
        this.subscriptionIntervalRef = setTimeout(() => this.subscriptionIntervalFn(), this.subscriptionRetryInterval)
        logger.info('Subscriber plugin started')
    }

    async stop(): Promise<void> {
        if (this.subscriptionIntervalRef) {
            clearTimeout(this.subscriptionIntervalRef)
            this.subscriptionIntervalRef = null
        }
        logger.info('Subscriber plugin stopped')
    }

}
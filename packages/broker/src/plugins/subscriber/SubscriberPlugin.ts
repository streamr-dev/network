import { Plugin, PluginOptions } from '../../Plugin'
import { Logger } from '@streamr/utils'
import { StreamPartID, toStreamID, toStreamPartID } from 'streamr-client-protocol'

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

    private readonly streamParts: StreamPartID[]
    private readonly subscriptionRetryInterval: number
    private subscriptionIntervalRef: NodeJS.Timeout | null

    constructor(options: PluginOptions) {
        super(options)
        this.streamParts = this.pluginConfig.streams.map((stream) => {
            return toStreamPartID(toStreamID(stream.streamId), stream.streamPartition)
        })
        this.subscriptionRetryInterval = this.pluginConfig.subscriptionRetryInterval
        this.subscriptionIntervalRef = null
    }

    private async subscribeToStreamParts(): Promise<void> {
        await Promise.all([
            ...this.streamParts.map(async (streamPart) => {
                const isAlreadySubscribed = (await this.streamrClient!.getSubscriptions(streamPart)).length > 0
                if (!isAlreadySubscribed) {
                    await this.streamrClient!.subscribe(streamPart, (_message: any) => {})
                }
            })
        ])
    }

    private async subscriptionIntervalFn(): Promise<void> {
        if (this.streamrClient) {
            try {
                await this.subscribeToStreamParts()
            } catch (err) {
                logger.warn(`Subscription retry failed, retrying in ${this.subscriptionRetryInterval / 1000} seconds`)
            }
        }
        this.subscriptionIntervalRef = setTimeout(() => this.subscriptionIntervalFn(), this.subscriptionRetryInterval)
    }

    async start(): Promise<void> {
        await this.subscribeToStreamParts()
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

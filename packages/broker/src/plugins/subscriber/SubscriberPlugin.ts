import { Plugin, PluginOptions } from '../../Plugin'
import { Logger, setAbortableTimeout } from '@streamr/utils'
import { StreamPartID, toStreamID, toStreamPartID } from 'streamr-client-protocol'

interface ConfigStream {
    streamId: string
    streamPartition: number
}

export interface SubscriberPluginConfig {
    streams: ConfigStream[]
    subscriptionRetryInterval: number
}

const logger = new Logger(module)

export class SubscriberPlugin extends Plugin<SubscriberPluginConfig> {
    private readonly streamParts: StreamPartID[]
    private readonly subscriptionRetryInterval: number

    constructor(options: PluginOptions) {
        super(options)
        this.streamParts = this.pluginConfig.streams.map((stream) => {
            return toStreamPartID(toStreamID(stream.streamId), stream.streamPartition)
        })
        this.subscriptionRetryInterval = this.pluginConfig.subscriptionRetryInterval
    }

    private async subscribeToStreamParts(): Promise<void> {
        const node = await this.streamrClient!.getNode()
        await Promise.all([
            ...this.streamParts.map(async (streamPart) => {
                node.subscribe(streamPart)
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
        setAbortableTimeout(() => this.subscriptionIntervalFn(), this.subscriptionRetryInterval, this.abortSignal)
    }

    async start(): Promise<void> {
        await this.subscribeToStreamParts()
        setAbortableTimeout(() => this.subscriptionIntervalFn(), this.subscriptionRetryInterval, this.abortSignal)
        logger.info('Subscriber plugin started')
    }

    // eslint-disable-next-line class-methods-use-this
    async stop(): Promise<void> {}
}

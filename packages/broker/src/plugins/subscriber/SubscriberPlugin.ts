import { Plugin, PluginOptions } from '../../Plugin'
import { allOrCleanup, Logger } from '@streamr/utils'
import { StreamPartIDUtils, toStreamID, toStreamPartID } from '@streamr/protocol'
import { Subscription } from 'streamr-client'

interface ConfigStream {
    streamId: string
    streamPartition: number
}

export interface SubscriberPluginConfig {
    streams: ConfigStream[]
}

const logger = new Logger(module)

export class SubscriberPlugin extends Plugin<SubscriberPluginConfig> {
    private readonly streamParts: { id: string, partition: number }[]
    private subscriptions: Subscription[] = []

    constructor(options: PluginOptions) {
        super(options)
        this.streamParts = this.pluginConfig.streams.map((stream) => {
            const streamPart = toStreamPartID(toStreamID(stream.streamId), stream.streamPartition)
            return {
                id: StreamPartIDUtils.getStreamID(streamPart),
                partition: StreamPartIDUtils.getStreamPartition(streamPart)
            }
        })
    }

    private async subscribeToStreamParts(): Promise<void> {
        this.subscriptions = await allOrCleanup(this.streamParts.map(({ id, partition }) => (
            this.streamrClient.subscribe({ id, partition, raw: true })
        )), (sub) => sub.unsubscribe())
    }

    async start(): Promise<void> {
        await this.subscribeToStreamParts()
        logger.info('Started subscriber plugin')
    }

    async stop(): Promise<void> {
        logger.info('Stop subscriber plugin')
        await Promise.all(this.subscriptions.map((sub) => sub.unsubscribe()))
    }

}

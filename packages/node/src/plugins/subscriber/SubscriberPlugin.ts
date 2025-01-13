import { Plugin } from '../../Plugin'
import { pTransaction, Logger } from '@streamr/utils'
import { Subscription, StreamrClient } from '@streamr/sdk'

interface ConfigStream {
    streamId: string
    streamPartition: number
}

export interface SubscriberPluginConfig {
    streams: ConfigStream[]
}

const logger = new Logger(module)

export class SubscriberPlugin extends Plugin<SubscriberPluginConfig> {
    private subscriptions: Subscription[] = []

    private async subscribeToStreamParts(streamrClient: StreamrClient): Promise<void> {
        this.subscriptions = await pTransaction(
            this.pluginConfig.streams.map(({ streamId, streamPartition }) =>
                streamrClient.subscribe({ id: streamId, partition: streamPartition, raw: true }, () => {})
            ),
            (sub) => sub.unsubscribe()
        )
    }

    async start(streamrClient: StreamrClient): Promise<void> {
        await this.subscribeToStreamParts(streamrClient)
        logger.info('Started subscriber plugin')
    }

    async stop(): Promise<void> {
        logger.info('Stop subscriber plugin')
        await Promise.all(this.subscriptions.map((sub) => sub.unsubscribe()))
    }
}

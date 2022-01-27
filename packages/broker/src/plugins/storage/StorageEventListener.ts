import { EthereumStorageEvent } from 'streamr-client/dist/types/src/NodeRegistry'
import { Stream, StreamrClient } from 'streamr-client'
import { Logger } from 'streamr-network'

const logger = new Logger(module)

/**
 * Hooks up to `StreamrClient#registerStorageEventListener` to learn about
 * stream assignment and removal events in real-time.
 */
export class StorageEventListener {
    private readonly clusterId: string
    private readonly streamrClient: StreamrClient
    private readonly handleEvent: (stream: Stream, type: 'added' | 'removed', block: number) => void

    constructor(
        clusterId: string,
        streamrClient: StreamrClient,
        handleEvent: (stream: Stream, type: 'added' | 'removed', block: number) => void
    ) {
        this.clusterId = clusterId.toLowerCase()
        this.streamrClient = streamrClient
        this.handleEvent = handleEvent
    }

    async start(): Promise<void> {
        this.streamrClient.registerStorageEventListener(
            async (event: EthereumStorageEvent) => {
                if (event.nodeAddress.toLowerCase() !== this.clusterId) {
                    return
                }
                logger.info('received EthereumStorageEvent: %j', event)
                try {
                    const stream = await this.streamrClient.getStream(event.streamId)
                    this.handleEvent(stream, event.type, event.blockNumber)
                } catch (e) {
                    logger.warn('chainEventsListener: %s', e)
                }
            }
        )
    }

    async destroy(): Promise<void> {
        await this.streamrClient.unRegisterStorageEventListeners()
    }
}

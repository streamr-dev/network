import { Stream, StreamrClient, StorageNodeAssignmentEvent } from 'streamr-client'
import { Logger } from 'streamr-network'

const logger = new Logger(module)

/**
 * Hooks up to `StreamrClient#registerStorageEventListener` to learn about
 * stream assignment and removal events in real-time.
 */
export class StorageEventListener {
    private readonly clusterId: string
    private readonly streamrClient: StreamrClient
    private readonly onEvent: (stream: Stream, type: 'added' | 'removed', block: number) => void

    constructor(
        clusterId: string,
        streamrClient: StreamrClient,
        onEvent: (stream: Stream, type: 'added' | 'removed', block: number) => void
    ) {
        this.clusterId = clusterId.toLowerCase()
        this.streamrClient = streamrClient
        this.onEvent = onEvent
    }

    async start(): Promise<void> {
        this.streamrClient.registerStorageEventListener(
            async (event: StorageNodeAssignmentEvent) => {
                if (event.nodeAddress.toLowerCase() !== this.clusterId) {
                    return
                }
                logger.info('received StorageNodeAssignmentEvent: %j', event)
                try {
                    const stream = await this.streamrClient.getStream(event.streamId)
                    this.onEvent(stream, event.type, event.blockNumber)
                } catch (e) {
                    logger.warn('chainEventsListener: %s', e)
                }
            }
        )
    }

    async destroy(): Promise<void> {
        await this.streamrClient.unregisterStorageEventListeners()
    }
}

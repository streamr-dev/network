import { Logger, Multimap } from '@streamr/utils'
import { MaintainTopologyHelper } from './MaintainTopologyHelper'
import StreamrClient, { Stream, Subscription } from 'streamr-client'
import { StreamID, StreamPartIDUtils } from '@streamr/protocol'
import pLimit from 'p-limit'

const logger = new Logger(module)

export class MaintainTopologyService {
    private readonly streamrClient: StreamrClient
    private readonly maintainTopologyHelper: MaintainTopologyHelper
    private readonly subscriptions = new Multimap<StreamID, Subscription>()
    private readonly concurrencyLimit = pLimit(1)

    constructor(streamrClient: StreamrClient, maintainTopologyHelper: MaintainTopologyHelper) {
        this.streamrClient = streamrClient
        this.maintainTopologyHelper = maintainTopologyHelper
    }

    async start(): Promise<void> {
        this.maintainTopologyHelper.on('addStakedStream', this.onAddStakedStreams)
        this.maintainTopologyHelper.on('removeStakedStream', this.onRemoveStakedStream)
        await this.maintainTopologyHelper.start()
        logger.info('Started')
    }

    async stop(): Promise<void> {
        this.maintainTopologyHelper.stop()
    }

    private onAddStakedStreams = (streamIDs: StreamID[]) => {
        streamIDs.map(this.concurrencyLimiter(this.addStream.bind(this)))
    }

    private onRemoveStakedStream = this.concurrencyLimiter(async (streamId: StreamID) => {
        const subscriptions = this.subscriptions.get(streamId)
        this.subscriptions.removeAll(streamId, subscriptions)
        await Promise.all(subscriptions.map((sub) => sub.unsubscribe())) // TODO: rejects?
    })

    private async addStream(streamId: StreamID): Promise<void> {
        let stream: Stream
        try {
            stream = await this.streamrClient.getStream(streamId)
        } catch (err) {
            logger.warn('Ignore non-existing stream', { streamId, reason: err?.message })
            return
        }
        for (const streamPart of stream.getStreamParts()) {
            const id = StreamPartIDUtils.getStreamID(streamPart)
            const partition = StreamPartIDUtils.getStreamPartition(streamPart)
            const subscription = await this.streamrClient.subscribe({
                id,
                partition,
                raw: true
            }) // TODO: rejects?
            this.subscriptions.add(id, subscription)
        }
    }

    private concurrencyLimiter(
        fn: (streamId: StreamID) => Promise<void>
    ): (streamId: StreamID) => void {
        return (streamId) => {
            this.concurrencyLimit(() => fn(streamId)).catch((err) => {
                logger.warn('Encountered error while processing event', { err })
            })
        }
    }
}

import { Logger, Multimap } from '@streamr/utils'
import { OperatorClient } from './FakeOperatorClient'
import StreamrClient, { Stream, Subscription } from 'streamr-client'
import { StreamID, StreamPartIDUtils, toStreamID } from '@streamr/protocol'

const logger = new Logger(module)

export class MaintainTopologyService {
    private readonly streamrClient: StreamrClient
    private readonly operatorClient: OperatorClient
    private readonly subscriptions = new Multimap<StreamID, Subscription>()

    constructor(streamrClient: StreamrClient, operatorClient: OperatorClient) {
        this.streamrClient = streamrClient
        this.operatorClient = operatorClient
    }

    // eslint-disable-next-line class-methods-use-this
    async start(): Promise<void> {
        this.operatorClient.on('addStakedStream', async (streamIdAsStr, blockNumber) => {
            if (blockNumber <= initialBlockNumber) {
                return
            }
            const streamId = toStreamID(streamIdAsStr) // shouldn't throw since value comes from contract
            if (this.subscriptions.get(streamId).length > 0) {
                logger.warn('Ignore already subscribed stream', { streamId })
                return
            }
            let stream: Stream
            try {
                stream = await this.streamrClient.getStream(streamId)
            } catch (err) {
                logger.warn('Ignore non-existing stream', { streamId, reason: err?.message })
                return
            }
            for (const streamPart of stream.getStreamParts()) {
                await this.streamrClient.subscribe({
                    id: StreamPartIDUtils.getStreamID(streamPart),
                    partition: StreamPartIDUtils.getStreamPartition(streamPart),
                    raw: true
                }) // TODO: what if rejects?
            }
        })
        this.operatorClient.on('removeStakedStream', async (streamIdAsStr, blockNumber) => {
            if (blockNumber <= initialBlockNumber) {
                return
            }
            const streamId = toStreamID(streamIdAsStr) // shouldn't throw since value comes from contract
            const subscriptions = this.subscriptions.get(streamId)
            this.subscriptions.removeAll(streamId, subscriptions)
            await Promise.all(subscriptions.map((sub) => sub.unsubscribe())) // TODO: what if rejects?
        })
        const { streamIds, blockNumber: initialBlockNumber } = await this.operatorClient.getStakedStreams()
        const streamParts = await Promise.all([...streamIds].map(async (streamId) => {
            try {
                const stream = await this.streamrClient.getStream(streamId)
                return stream.getStreamParts()
            } catch (err) {
                logger.warn('Ignore non-existing stream', { streamId, reason: err?.message })
                return []
            }
        }))
        for (const streamPart of streamParts.flat()) {
            const id = StreamPartIDUtils.getStreamID(streamPart)
            const subscription = await this.streamrClient.subscribe({
                id,
                partition: StreamPartIDUtils.getStreamPartition(streamPart),
                raw: true
            }) // TODO: what if rejects?
            this.subscriptions.add(id, subscription)
        }
        logger.info('Started')
    }

    // eslint-disable-next-line class-methods-use-this
    async stop(): Promise<void> {
        logger.info('stopped')
    }
}

import { Logger, Multimap } from '@streamr/utils'
import { OperatorClient } from './FakeOperatorClient'
import StreamrClient, { Stream, Subscription } from 'streamr-client'
import { StreamID, StreamPartIDUtils, toStreamID } from '@streamr/protocol'
import { SetMembershipSynchronizer } from '../storage/SetMembershipSynchronizer'
import pLimit from 'p-limit'

const logger = new Logger(module)

function mapOverSet<T, U>(set: Set<T>, transformFn: (t: T) => U): Set<U> {
    return new Set([...set].map(transformFn))
}

export class MaintainTopologyService {
    private readonly streamrClient: StreamrClient
    private readonly operatorClient: OperatorClient
    private readonly subscriptions = new Multimap<StreamID, Subscription>()
    private readonly setMembershipSynchronizer = new SetMembershipSynchronizer<StreamID>()
    private readonly concurrencyLimit = pLimit(1)

    constructor(streamrClient: StreamrClient, operatorClient: OperatorClient) {
        this.streamrClient = streamrClient
        this.operatorClient = operatorClient
    }

    // eslint-disable-next-line class-methods-use-this
    async start(): Promise<void> {
        this.operatorClient.on('addStakedStream', this.onEvent.bind(this, 'addStakedStream'))
        this.operatorClient.on('removeStakedStream', this.onEvent.bind(this, 'removeStakedStream'))
        const { streamIds, blockNumber: initialBlockNumber } = await this.operatorClient.getStakedStreams()
        const { added } = this.setMembershipSynchronizer.ingestSnapshot(mapOverSet(streamIds, toStreamID), initialBlockNumber)
        const streamParts = await Promise.all([...added].map(async (streamId) => {
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

    private async onEvent(event: 'addStakedStream' | 'removeStakedStream', streamIdAsStr: string, blockNumber: number) {
        return this.concurrencyLimit(async () => {
            if (event === 'addStakedStream') {
                const { added } = this.setMembershipSynchronizer.ingestPatch(new Set([toStreamID(streamIdAsStr)]), 'added', blockNumber)
                if (added.length !== 1) {
                    return
                }
                const [streamId] = added
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
                    const id = StreamPartIDUtils.getStreamID(streamPart)
                    const subscription = await this.streamrClient.subscribe({
                        id,
                        partition: StreamPartIDUtils.getStreamPartition(streamPart),
                        raw: true
                    }) // TODO: what if rejects?
                    this.subscriptions.add(id, subscription)
                }
            } else {
                const { removed } = this.setMembershipSynchronizer.ingestPatch(new Set([toStreamID(streamIdAsStr)]), 'removed', blockNumber)
                if (removed.length !== 1) {
                    return
                }
                const [streamId] = removed
                const subscriptions = this.subscriptions.get(streamId)
                this.subscriptions.removeAll(streamId, subscriptions)
                await Promise.all(subscriptions.map((sub) => sub.unsubscribe())) // TODO: what if rejects?
            }
        })
    }
}

import { Logger, Multimap } from '@streamr/utils'
import { OperatorClient } from './OperatorClient'
import StreamrClient, { Stream, Subscription } from 'streamr-client'
import { StreamID, StreamPartIDUtils, toStreamID } from '@streamr/protocol'
import { SetMembershipSynchronizer } from '../storage/SetMembershipSynchronizer'
import pLimit from 'p-limit'
import { compact } from 'lodash'

const logger = new Logger(module)

function toStreamIDSafe(input: string): StreamID | undefined {
    try {
        return toStreamID(input)
    } catch {
        return undefined
    }
}

function singletonSet<T>(element: T): Set<T> {
    return new Set<T>([element])
}

export class MaintainTopologyService {
    private readonly streamrClient: StreamrClient
    private readonly operatorClient: OperatorClient
    private readonly subscriptions = new Multimap<StreamID, Subscription>()
    private readonly synchronizer = new SetMembershipSynchronizer<StreamID>()
    private readonly concurrencyLimit = pLimit(1)

    constructor(streamrClient: StreamrClient, operatorClient: OperatorClient) {
        this.streamrClient = streamrClient
        this.operatorClient = operatorClient
    }

    async start(): Promise<void> {
        this.operatorClient.on('addStakedStream', this.onAddStakedStream)
        this.operatorClient.on('removeStakedStream', this.onRemoveStakedStream)
        const rawStreamIds = await this.operatorClient.getStakedStreams()
        const blockNumber = 0 // TODO: fix properly
        const streamIds = new Set(compact([...rawStreamIds].map(toStreamIDSafe)))
        const { added } = this.synchronizer.ingestSnapshot(streamIds, blockNumber)
        for (const streamId of added) {
            await this.addStream(streamId, blockNumber)
        }
        logger.info('Started')
    }

    // eslint-disable-next-line class-methods-use-this
    async stop(): Promise<void> {
        this.operatorClient.stop()
        logger.info('stopped')
    }

    private onAddStakedStream = this.parseStreamIdWrapper(async (streamId: StreamID, blockNumber: number) => {
        const { added } = this.synchronizer.ingestPatch(singletonSet(streamId), 'added', blockNumber)
        if (added.length !== 1) {
            logger.warn('Ignore already subscribed stream', { streamId, blockNumber })
            return
        }
        if (this.subscriptions.get(streamId).length > 0) {
            logger.warn('Ignore already subscribed stream', { streamId, blockNumber })
            return
        }
        await this.addStream(streamId, blockNumber)
    })

    private onRemoveStakedStream = this.parseStreamIdWrapper(async (streamId: StreamID, blockNumber: number) => {
        const { removed } = this.synchronizer.ingestPatch(singletonSet(streamId), 'removed', blockNumber)
        if (removed.length !== 1) {
            logger.warn('Ignore already unsubscribed stream', { streamId, blockNumber })
            return
        }
        const subscriptions = this.subscriptions.get(streamId)
        this.subscriptions.removeAll(streamId, subscriptions)
        await Promise.all(subscriptions.map((sub) => sub.unsubscribe())) // TODO: rejects?
    })

    private async addStream(streamId: StreamID, blockNumber: number): Promise<void> {
        let stream: Stream
        try {
            stream = await this.streamrClient.getStream(streamId)
        } catch (err) {
            logger.warn('Ignore non-existing stream', { streamId, reason: err?.message, blockNumber })
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

    private parseStreamIdWrapper(
        fn: (streamId: StreamID, blockNumber: number) => Promise<void>
    ): (streamIdAsStr: string, blockNumber: number) => void {
        return (streamIdAsStr: string, blockNumber: number) => {
            const streamId = toStreamIDSafe(streamIdAsStr)
            if (streamId !== undefined) {
                this.concurrencyLimit(() => fn(streamId, blockNumber))
            } else {
                logger.warn('Encountered invalid stream id', { streamIdAsStr })
            }
        }
    }
}

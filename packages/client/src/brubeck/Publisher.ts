import { StreamMessage } from 'streamr-client-protocol'
import { BrubeckClient } from './BrubeckClient'
import StreamMessageCreator from '../publish/MessageCreator'
import { getStreamId, StreamIDish } from '../publish/utils'
import { FailedToPublishError } from '../publish'
import { counterId } from '../utils'
import { Context } from './Context'
import { CancelableGenerator } from '../utils/iterators'

type PublishMessageOptions<T> = {
    content: T
    timestamp?: string | number | Date
    partitionKey?: string | number
}

type Cancelable = {
    cancel(err?: Error): Promise<void>
    isCancelled: () => boolean
}

export default class BrubeckPublisher implements Context {
    client
    messageCreator
    id
    debug
    inProgress = new Set<Cancelable>()

    constructor(client: BrubeckClient) {
        this.client = client
        this.messageCreator = new StreamMessageCreator(this.client.client)
        this.id = counterId(this.constructor.name)
        this.debug = this.client.debug.extend(this.id)
    }

    async publishMessage<T>(streamObjectOrId: StreamIDish, {
        content,
        timestamp = new Date(),
        partitionKey
    }: PublishMessageOptions<T>): Promise<StreamMessage<T>> {
        const streamMessage = await this.messageCreator.create<T>(streamObjectOrId, {
            content,
            timestamp,
            partitionKey,
        })

        const node = await this.client.getNode()
        node.publish(streamMessage)
        return streamMessage
    }

    async publish<T>(
        streamObjectOrId: StreamIDish,
        content: T,
        timestamp?: string | number | Date,
        partitionKey?: string | number
    ): Promise<StreamMessage<T>> {
        // wrap publish in error emitter
        try {
            return await this.publishMessage<T>(streamObjectOrId, {
                content,
                timestamp,
                partitionKey,
            })
        } catch (err) {
            getStreamId(streamObjectOrId)
            const streamId = getStreamId(streamObjectOrId)
            const error = new FailedToPublishError(
                streamId,
                content,
                err
            )
            throw error
        }
    }

    async collect<T>(target: AsyncIterable<T>, n?: number) { // eslint-disable-line class-methods-use-this
        const msgs = []
        for await (const msg of target) {
            if (n === 0) {
                break
            }

            msgs.push(msg)
            if (msgs.length === n) {
                break
            }
        }

        return msgs
    }

    async* publishFrom<T>(streamObjectOrId: StreamIDish, seq: AsyncIterable<T>) {
        const items = CancelableGenerator(seq)
        this.inProgress.add(items)
        try {
            for await (const msg of items) {
                yield await this.publish(streamObjectOrId, msg)
            }
        } finally {
            this.inProgress.delete(items)
        }
    }

    async* publishWithMetadata<T>(streamObjectOrId: StreamIDish, seq: AsyncIterable<PublishMessageOptions<T>>) {
        const items = CancelableGenerator(seq)
        this.inProgress.add(items)
        try {
            for await (const msg of items) {
                yield await this.publishMessage(streamObjectOrId, msg)
            }
        } finally {
            this.inProgress.delete(items)
        }
    }

    async stop() {
        await Promise.allSettled([
            ...[...this.inProgress].map((item) => item.cancel())
        ])

        await this.messageCreator.stop()
    }
}

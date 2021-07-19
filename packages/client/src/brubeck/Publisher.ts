import { inspect } from '../utils/log'
import { StreamMessage, SPID, SIDLike } from 'streamr-client-protocol'
import { BrubeckClient } from './BrubeckClient'
import StreamMessageCreator from '../publish/MessageCreator'
import { FailedToPublishError } from '../publish'
import { counterId } from '../utils'
import { Context } from '../utils/Context'
import { CancelableGenerator, ICancelable } from '../utils/iterators'

const wait = (ms: number = 0) => new Promise((resolve) => setTimeout(resolve, ms))

type PublishMessageOptions<T> = {
    content: T
    timestamp?: string | number | Date
    partitionKey?: string | number
}

export default class BrubeckPublisher implements Context {
    client
    messageCreator
    id
    debug
    inProgress = new Set<ICancelable>()

    constructor(client: BrubeckClient) {
        this.client = client
        this.messageCreator = new StreamMessageCreator(this.client.client)
        this.id = counterId(this.constructor.name)
        this.debug = this.client.debug.extend(this.id)
    }

    async publishMessage<T>(streamObjectOrId: SIDLike, {
        content,
        timestamp = new Date(),
        partitionKey
    }: PublishMessageOptions<T>): Promise<StreamMessage<T>> {
        const sid = SPID.parse(streamObjectOrId)
        const streamMessage = await this.messageCreator.create<T>(sid, {
            content,
            timestamp,
            partitionKey,
        })

        const node = await this.client.getNode()
        node.publish(streamMessage)
        return streamMessage
    }

    async publish<T>(
        streamObjectOrId: SIDLike,
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
            const { streamId } = SPID.parse(streamObjectOrId)
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

    async* publishFrom<T>(streamObjectOrId: SIDLike, seq: AsyncIterable<T>) {
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

    async* publishFromMetadata<T>(streamObjectOrId: SIDLike, seq: AsyncIterable<PublishMessageOptions<T>>) {
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

    async waitForStorage(streamMessage: StreamMessage, {
        interval = 500,
        timeout = 10000,
        count = 100,
        messageMatchFn = (msgTarget: StreamMessage, msgGot: StreamMessage) => msgTarget.signature === msgGot.signature
    }: {
        interval?: number
        timeout?: number
        count?: number
        messageMatchFn?: (msgTarget: StreamMessage, msgGot: StreamMessage) => boolean
    } = {}) {

        const { spid } = streamMessage

        /* eslint-disable no-await-in-loop */
        const start = Date.now()
        let last: any
        // eslint-disable-next-line no-constant-condition
        let found = false
        while (!found) {
            const duration = Date.now() - start
            if (duration > timeout) {
                this.debug('waitForStorage timeout %o', {
                    timeout,
                    duration
                }, {
                    streamMessage,
                    last: last!.map((l: any) => l.content),
                })
                const err: any = new Error(`timed out after ${duration}ms waiting for message: ${inspect(streamMessage)}`)
                err.streamMessage = streamMessage
                throw err
            }

            last = await this.client.client.getStreamLast({
                streamId: spid.streamId,
                streamPartition: spid.streamPartition,
                count,
            })

            for (const lastMsg of last) {
                if (messageMatchFn(streamMessage, lastMsg)) {
                    found = true
                    return
                }
            }

            this.debug('message not found, retrying... %o', {
                msg: streamMessage.getParsedContent(),
                last: last.map(({ content }: any) => content)
            })

            await wait(interval)
        }
        /* eslint-enable no-await-in-loop */
    }

    async stop() {
        await Promise.allSettled([
            ...[...this.inProgress].map((item) => item.cancel())
        ])

        await this.messageCreator.stop()
    }
}

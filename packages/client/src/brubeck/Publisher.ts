import { inspect } from '../utils/log'
import { StreamMessage, SPID, SIDLike, MessageContent } from 'streamr-client-protocol'
import StreamMessageCreator from './MessageCreator'
import { FailedToPublishError } from '../publish'
import { instanceId } from '../utils'
import { Context } from '../utils/Context'
import { CancelableGenerator, ICancelable } from '../utils/iterators'
import BrubeckNode from './BrubeckNode'
import { scoped, Lifecycle } from 'tsyringe'
import { StreamEndpoints } from './StreamEndpoints'

const wait = (ms: number = 0) => new Promise((resolve) => setTimeout(resolve, ms))

export type PublishMetadata<T extends MessageContent> = {
    content: T
    timestamp?: string | number | Date
    sequenceNumber?: number
    partitionKey?: string | number
}

@scoped(Lifecycle.ContainerScoped)
export default class BrubeckPublisher implements Context {
    id
    debug
    inProgress = new Set<ICancelable>()

    constructor(
        context: Context,
        private brubeckNode: BrubeckNode,
        private messageCreator: StreamMessageCreator,
        private streamEndpoints: StreamEndpoints
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
    }

    async publishMessage<T extends MessageContent>(streamObjectOrId: SIDLike, {
        content,
        timestamp = Date.now(),
        partitionKey
    }: PublishMetadata<T>): Promise<StreamMessage<T>> {
        const sid = SPID.parse(streamObjectOrId)
        const timestampAsNumber = timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp).getTime()

        // figure out partition
        if ((sid.streamPartition != null) && (partitionKey != null)) {
            throw new Error('Invalid combination of "partition" and "partitionKey"')
        }
        const streamMessage = await this.messageCreator.create<T>(sid.streamId, {
            content,
            timestamp: timestampAsNumber,
            partitionKey: sid.streamPartition != null ? sid.streamPartition : partitionKey || 0,
        })

        const node = await this.brubeckNode.getNode()
        node.publish(streamMessage)
        return streamMessage
    }

    async publish<T extends MessageContent>(
        streamObjectOrId: SIDLike,
        content: T,
        timestamp: string | number | Date = Date.now(),
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

    async collect<T>(target: AsyncIterable<StreamMessage<T>>, n?: number) { // eslint-disable-line class-methods-use-this
        const msgs = []
        for await (const msg of target) {
            if (n === 0) {
                break
            }

            msgs.push(msg.getParsedContent())
            if (msgs.length === n) {
                break
            }
        }

        return msgs
    }

    async collectMessages<T>(target: AsyncIterable<T>, n?: number) { // eslint-disable-line class-methods-use-this
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

    async* publishFrom<T extends MessageContent>(streamObjectOrId: SIDLike, seq: AsyncIterable<T>) {
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

    async* publishFromMetadata<T extends MessageContent>(streamObjectOrId: SIDLike, seq: AsyncIterable<PublishMetadata<T>>) {
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

            last = await this.streamEndpoints.getStreamLast(spid, count)

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

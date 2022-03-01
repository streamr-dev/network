/**
 * Public Publishing API
 */
import { StreamMessage } from 'streamr-client-protocol'
import { scoped, Lifecycle, inject, delay } from 'tsyringe'

import { instanceId } from '../utils'
import { inspect } from '../utils/log'
import { Context, ContextError } from '../utils/Context'
import { CancelableGenerator, ICancelable } from '../utils/iterators'

import { StreamEndpoints } from '../StreamEndpoints'
import PublishPipeline, { PublishMetadata } from './PublishPipeline'
import { Stoppable } from '../utils/Stoppable'
import { PublisherKeyExchange } from '../encryption/KeyExchangePublisher'
import Validator from '../Validator'
import BrubeckNode from '../BrubeckNode'
import { StreamIDBuilder } from '../StreamIDBuilder'
import { StreamDefinition } from '../types'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'

export type { PublishMetadata }

const wait = (ms: number = 0) => new Promise((resolve) => setTimeout(resolve, ms))

@scoped(Lifecycle.ContainerScoped)
export default class BrubeckPublisher implements Context, Stoppable {
    readonly id
    readonly debug
    streamMessageQueue
    publishQueue
    isStopped = false

    private inProgress = new Set<ICancelable>()

    constructor(
        context: Context,
        private pipeline: PublishPipeline,
        private node: BrubeckNode,
        private validator: Validator,
        @inject(StreamIDBuilder) private streamIdBuilder: StreamIDBuilder,
        @inject(delay(() => PublisherKeyExchange)) private keyExchange: PublisherKeyExchange,
        @inject(delay(() => StreamEndpoints)) private streamEndpoints: StreamEndpoints,
        @inject(ConfigInjectionToken.Root) private config: StrictStreamrClientConfig
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
        this.streamMessageQueue = pipeline.streamMessageQueue
        this.publishQueue = pipeline.publishQueue
    }

    /**
     * @category Important
     */
    async publish<T>(
        streamDefinition: StreamDefinition,
        content: T,
        timestamp: string | number | Date = Date.now(),
        partitionKey?: string | number
    ): Promise<StreamMessage<T>> {
        return this.publishMessage<T>(streamDefinition, {
            content,
            timestamp,
            partitionKey,
        })
    }

    private async publishMessage<T>(streamDefinition: StreamDefinition, {
        content,
        timestamp = Date.now(),
        partitionKey
    }: PublishMetadata<T>): Promise<StreamMessage<T>> {
        const timestampAsNumber = timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp).getTime()
        return this.pipeline.publish({
            streamDefinition,
            content,
            timestamp: timestampAsNumber,
            partitionKey,
        })
    }

    /** @internal */
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

    /** @internal */
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

    /** @internal */
    async* publishFrom<T>(streamDefinition: StreamDefinition, seq: AsyncIterable<T>) {
        const items = CancelableGenerator(seq)
        this.inProgress.add(items)
        try {
            for await (const msg of items) {
                yield await this.publish(streamDefinition, msg)
            }
        } finally {
            this.inProgress.delete(items)
        }
    }

    /** @internal */
    async* publishFromMetadata<T>(streamDefinition: StreamDefinition, seq: AsyncIterable<PublishMetadata<T>>) {
        const items = CancelableGenerator(seq)
        this.inProgress.add(items)
        try {
            for await (const msg of items) {
                yield await this.publishMessage(streamDefinition, msg)
            }
        } finally {
            this.inProgress.delete(items)
        }
    }

    async waitForStorage(streamMessage: StreamMessage, {
        // eslint-disable-next-line no-underscore-dangle
        interval = this.config._timeouts.storageNode.retryInterval,
        // eslint-disable-next-line no-underscore-dangle
        timeout = this.config._timeouts.storageNode.timeout,
        count = 100,
        messageMatchFn = (msgTarget: StreamMessage, msgGot: StreamMessage) => {
            return msgTarget.signature === msgGot.signature
        }
    }: {
        interval?: number
        timeout?: number
        count?: number
        messageMatchFn?: (msgTarget: StreamMessage, msgGot: StreamMessage) => boolean
    } = {}) {
        if (!streamMessage) {
            throw new ContextError(this, 'waitForStorage requires a StreamMessage, got:', streamMessage)
        }

        /* eslint-disable no-await-in-loop */
        const start = Date.now()
        let last: any
        // eslint-disable-next-line no-constant-condition
        let found = false
        while (!found && !this.isStopped) {
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

            last = await this.streamEndpoints.getStreamLast(streamMessage.getStreamPartID(), count)

            for (const lastMsg of last) {
                if (messageMatchFn(streamMessage, lastMsg)) {
                    found = true
                    this.debug('last message found')
                    return
                }
            }

            this.debug('message not found, retrying... %o', {
                msg: streamMessage.getParsedContent(),
                'last 3': last.slice(-3).map(({ content }: any) => content)
            })

            await wait(interval)
        }
        /* eslint-enable no-await-in-loop */
    }

    /** @internal */
    startKeyExchange() {
        return this.keyExchange.start()
    }

    /** @internal */
    stopKeyExchange() {
        return this.keyExchange.stop()
    }

    async setPublishProxy(streamDefinition: StreamDefinition, nodeId: string): Promise<void> {
        const streamPartId = await this.streamIdBuilder.toStreamPartID(streamDefinition)
        await this.node.openPublishProxyConnectionOnStreamPart(streamPartId, nodeId)
    }

    async removePublishProxy(streamDefinition: StreamDefinition, nodeId: string): Promise<void> {
        const streamPartId = await this.streamIdBuilder.toStreamPartID(streamDefinition)
        await this.node.closePublishProxyConnectionOnStreamPart(streamPartId, nodeId)
    }

    async setPublishProxies(streamDefinition: StreamDefinition, nodeIds: string[]): Promise<void> {
        const streamPartId = await this.streamIdBuilder.toStreamPartID(streamDefinition)
        await Promise.allSettled([
            ...nodeIds.map((nodeId) => this.node.openPublishProxyConnectionOnStreamPart(streamPartId, nodeId))
        ])
    }

    async removePublishProxies(streamDefinition: StreamDefinition, nodeIds: string[]): Promise<void> {
        const streamPartId = await this.streamIdBuilder.toStreamPartID(streamDefinition)
        await Promise.allSettled([
            ...nodeIds.map(async (nodeId) => this.node.closePublishProxyConnectionOnStreamPart(streamPartId, nodeId))
        ])
    }

    /** @internal */
    async start() {
        this.isStopped = false
        this.pipeline.start()
    }

    /** @internal */
    async stop() {
        this.isStopped = true
        await Promise.allSettled([
            this.pipeline.stop(),
            ...[...this.inProgress].map((item) => item.cancel().catch(() => {}))
        ])
    }
}

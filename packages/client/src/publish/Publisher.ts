/**
 * Public Publishing API
 */
import { StreamMessage } from 'streamr-client-protocol'
import { scoped, Lifecycle, inject, delay } from 'tsyringe'

import { instanceId } from '../utils'
import { Context } from '../utils/Context'
import { CancelableGenerator, ICancelable } from '../utils/iterators'
import PublishPipeline, { PublishMetadata } from './PublishPipeline'
import { Stoppable } from '../utils/Stoppable'
import { PublisherKeyExchange } from '../encryption/KeyExchangePublisher'
import BrubeckNode from '../BrubeckNode'
import { StreamIDBuilder } from '../StreamIDBuilder'
import { StreamDefinition } from '../types'

export type { PublishMetadata }

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
        @inject(StreamIDBuilder) private streamIdBuilder: StreamIDBuilder,
        @inject(delay(() => PublisherKeyExchange)) private keyExchange: PublisherKeyExchange
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

/**
 * Public Publishing API
 */
import { StreamMessage } from 'streamr-client-protocol'
import { scoped, Lifecycle } from 'tsyringe'

import { instanceId } from '../utils'
import { Context } from '../utils/Context'
import { CancelableGenerator, ICancelable } from '../utils/iterators'

import { MessageMetadata, PublishMetadata, PublishPipeline } from './PublishPipeline'
import { StreamDefinition } from '../types'

export type { PublishMetadata }

const parseTimestamp = (metadata?: MessageMetadata): number => {
    if (metadata?.timestamp === undefined) {
        return Date.now()
    } else {
        return metadata.timestamp instanceof Date ? metadata.timestamp.getTime() : new Date(metadata.timestamp).getTime()
    }
}

@scoped(Lifecycle.ContainerScoped)
export class Publisher implements Context {
    readonly id
    readonly debug
    private inProgress = new Set<ICancelable>()

    constructor(
        context: Context,
        private pipeline: PublishPipeline
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
    }

    async publish<T>(streamDefinition: StreamDefinition, content: T, metadata?: MessageMetadata): Promise<StreamMessage<T>> {
        return this.pipeline.publish({
            streamDefinition,
            content,
            timestamp: parseTimestamp(metadata),
            partitionKey: metadata?.partitionKey,
            msgChainId: metadata?.msgChainId,
            messageType: metadata?.messageType,
            encryptionType: metadata?.encryptionType
        })
    }

    async collect<T>(target: AsyncIterable<StreamMessage<T>>, n?: number): Promise<T[]> { // eslint-disable-line class-methods-use-this
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

    async collectMessages<T>(target: AsyncIterable<T>, n?: number): Promise<Awaited<T>[]> { // eslint-disable-line class-methods-use-this
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

    async* publishFrom<T>(streamDefinition: StreamDefinition, seq: AsyncIterable<T>): AsyncGenerator<StreamMessage<T>, void, unknown> {
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

    async* publishFromMetadata<T>(
        streamDefinition: StreamDefinition, 
        seq: AsyncIterable<PublishMetadata<T>>
    ): AsyncGenerator<StreamMessage<T>, void, unknown> {
        const items = CancelableGenerator(seq)
        this.inProgress.add(items)
        try {
            for await (const msg of items) {
                yield await this.publish(streamDefinition, msg.content, {
                    timestamp: msg.timestamp,
                    partitionKey: msg.partitionKey
                })
            }
        } finally {
            this.inProgress.delete(items)
        }
    }

    async start(): Promise<void> {
        this.pipeline.start()
    }

    async stop(): Promise<void> {
        await Promise.allSettled([
            this.pipeline.stop(),
            ...[...this.inProgress].map((item) => item.cancel().catch(() => {}))
        ])
    }
}

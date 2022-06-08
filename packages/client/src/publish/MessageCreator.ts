/**
 * Central place to fetch async dependencies and convert message metadata into StreamMessages.
 */
import { inject, scoped, Lifecycle } from 'tsyringe'
import {
    StreamMessage,
    StreamMessageEncrypted,
    StreamMessageSigned,
    StreamID,
    toStreamPartID
} from 'streamr-client-protocol'

import { LimitAsyncFnByKey } from '../utils'

import { getCachedMessageChain } from './MessageChain'
import { ConfigInjectionToken, CacheConfig } from '../Config'
import { Ethereum } from '../Ethereum'
import { StreamPartitioner } from './StreamPartitioner'

export type MessageCreateOptions<T = unknown> = {
    content: T,
    timestamp: number,
    partitionKey?: string | number
    msgChainId?: string
}

export interface IMessageCreator {
    create: <T>(streamId: StreamID, options: MessageCreateOptions<T>) => Promise<StreamMessage<T>>
    stop: () => Promise<void> | void
}

export class MessageCreatorAnonymous implements IMessageCreator {
    // eslint-disable-next-line class-methods-use-this
    async create<T>(_streamId: string, _options: MessageCreateOptions<T>): Promise<StreamMessage<T>> {
        throw new Error('Anonymous user can not publish.')
    }

    // eslint-disable-next-line class-methods-use-this
    stop(): void {}
}

/**
 * Create StreamMessages from metadata.
 */
@scoped(Lifecycle.ContainerScoped)
export class MessageCreator implements IMessageCreator {
    // encrypt
    queue: ReturnType<typeof LimitAsyncFnByKey>
    getMsgChain

    /*
     * Get function for creating stream messages.
     */

    constructor(
        private streamPartitioner: StreamPartitioner,
        private ethereum: Ethereum,
        @inject(ConfigInjectionToken.Cache) private cacheOptions: CacheConfig,
    ) {
        this.getMsgChain = getCachedMessageChain(this.cacheOptions)

        // per-stream queue so messages processed in-order
        this.queue = LimitAsyncFnByKey(1)
    }

    async create<T = unknown>(streamId: StreamID, {
        content,
        timestamp,
        partitionKey,
        msgChainId,
        ...opts
    }: MessageCreateOptions<T>): Promise<StreamMessageSigned<T> | StreamMessageEncrypted<T>> {
        // streamId as queue key
        return this.queue(streamId, async () => {
            // load cached stream + publisher details
            const [streamPartition, publisherIdChecksumCase] = await Promise.all([
                this.streamPartitioner.compute(streamId, partitionKey),
                this.ethereum.getAddress(),
            ])

            const streamPartId = toStreamPartID(streamId, streamPartition)
            const publisherId = publisherIdChecksumCase.toLowerCase()

            // chain messages
            const chain = this.getMsgChain(streamPartId, {
                publisherId, msgChainId
            })

            const [messageId, prevMsgRef] = chain.add(timestamp)

            const streamMessage: StreamMessage<T> = StreamMessage.isStreamMessageContainer(content)
                // TODO: typing for stream message containers
                // e.g. transparent handling for StreamMessage<SomeClass> where SomeClass implements toStreamMessage & {de}serialization methods
                ? (content.toStreamMessage(messageId, prevMsgRef || null)) as StreamMessage<any>
                : new StreamMessage({
                    messageId,
                    prevMsgRef,
                    content,
                    ...opts
                })

            return streamMessage
        })
    }

    async stop(): Promise<void> {
        this.streamPartitioner.clear()
        this.queue.clear()
        this.getMsgChain.clear()
    }
}

/**
 * Central place to fetch async dependencies and convert message metadata into StreamMessages.
 */
import { inject, scoped, Lifecycle } from 'tsyringe'
import type { StreamMessageEncrypted, StreamMessageSigned } from 'streamr-client-protocol'
import { StreamMessage, SPID } from 'streamr-client-protocol'

import { LimitAsyncFnByKey } from './utils'
import type { Stoppable } from './utils/Stoppable'

import { getCachedMesssageChain } from './MessageChain'
import type { CacheConfig } from './Config'
import { Config } from './Config'
import type Ethereum from './Ethereum'
import type StreamPartitioner from './StreamPartitioner'

export type MessageCreateOptions<T = unknown> = {
    content: T,
    timestamp: number,
    partitionKey?: string | number
    msgChainId?: string
}

export interface IMessageCreator {
    create: <T>(streamId: string, options: MessageCreateOptions<T>) => Promise<StreamMessage<T>>
    stop: () => Promise<void> | void
}

export class StreamMessageCreatorAnonymous implements IMessageCreator {
    // eslint-disable-next-line class-methods-use-this
    async create<T>(_streamId: string, _options: MessageCreateOptions<T>): Promise<StreamMessage<T>> {
        throw new Error('Anonymous user can not publish.')
    }

    // eslint-disable-next-line class-methods-use-this
    stop() {}
}

/**
 * Create StreamMessages from metadata.
 */
@scoped(Lifecycle.ContainerScoped)
export default class StreamMessageCreator implements IMessageCreator, Stoppable {
    isStopped = false
    // encrypt
    queue: ReturnType<typeof LimitAsyncFnByKey>
    getMsgChain

    /*
     * Get function for creating stream messages.
     */

    constructor(
        private streamPartitioner: StreamPartitioner,
        private ethereum: Ethereum,
        @inject(Config.Cache) private cacheOptions: CacheConfig,
    ) {
        this.getMsgChain = getCachedMesssageChain(this.cacheOptions)

        // per-stream queue so messages processed in-order
        this.queue = LimitAsyncFnByKey(1)
    }

    async create<T = unknown>(streamId: string, {
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

            const spid = SPID.from({ streamId, streamPartition })
            const publisherId = publisherIdChecksumCase.toLowerCase()

            // chain messages
            const chain = this.getMsgChain(spid, {
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

    async start() {
        this.isStopped = false
    }

    async stop() {
        this.isStopped = true
        this.streamPartitioner.clear()
        this.queue.clear()
        this.getMsgChain.clear()
    }
}

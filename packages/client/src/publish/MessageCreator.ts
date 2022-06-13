/**
 * Central place to fetch async dependencies and convert message metadata into StreamMessages.
 */
import { inject, scoped, Lifecycle } from 'tsyringe'
import {
    StreamMessage,
    StreamMessageEncrypted,
    StreamMessageSigned,
    StreamID,
    toStreamPartID,
    StreamMessageType,
    EncryptionType
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
    msgChainId?: string,
    messageType?: StreamMessageType
    encryptionType?: EncryptionType
}

/**
 * Create StreamMessages from metadata.
 */
@scoped(Lifecycle.ContainerScoped)
export class MessageCreator {
    // encrypt
    private queue: ReturnType<typeof LimitAsyncFnByKey>
    private getMsgChain

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

            const streamMessage = new StreamMessage({
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

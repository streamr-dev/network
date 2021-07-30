import { inject, scoped, Lifecycle } from 'tsyringe'
import { StreamMessage, SPID, MessageContent, StreamMessageEncrypted, StreamMessageSigned } from 'streamr-client-protocol'

import { LimitAsyncFnByKey } from '../utils'

import Signer from './Signer'
// import Encrypt from './Encrypt'
// import { GroupKey } from '../stream'
import { getCachedMesssageChain } from './MessageChain'
import { Config, CacheConfig } from './Config'
import Ethereum from './Ethereum'
import StreamPartitioner from './StreamPartitioner'

export type MessageCreateOptions<T extends MessageContent> = {
    content: T
    timestamp: number,
    partitionKey: string | number
    msgChainId?: string
}

export interface IMessageCreator {
    create: <T extends MessageContent>(streamId: string, options: MessageCreateOptions<T>) => Promise<StreamMessage<T>>
    stop: () => Promise<void> | void
}

export class StreamMessageCreatorAnonymous implements IMessageCreator {
    // eslint-disable-next-line class-methods-use-this
    async create<T extends MessageContent>(_streamId: string, _options: MessageCreateOptions<T>): Promise<StreamMessage<T>> {
        throw new Error('Anonymous user can not publish.')
    }

    // eslint-disable-next-line class-methods-use-this
    stop() {}
}

@scoped(Lifecycle.ContainerScoped)
export default class StreamMessageCreator implements IMessageCreator {
    // encrypt
    queue: ReturnType<typeof LimitAsyncFnByKey>
    getMsgChain

    /*
     * Get function for creating stream messages.
     */

    constructor(
        private signer: Signer,
        private ethereum: Ethereum,
        private streamPartitioner: StreamPartitioner,
        @inject(Config.Cache) private cacheOptions: CacheConfig,
    ) {
        this.getMsgChain = getCachedMesssageChain(this.cacheOptions)
        // this.encrypt = Encrypt(client)

        // per-stream queue so messages processed in-order
        this.queue = LimitAsyncFnByKey(1)
    }

    async create<T extends MessageContent>(streamId: string, {
        content,
        timestamp,
        partitionKey,
        msgChainId,
        ...opts
    }: MessageCreateOptions<T>): Promise<StreamMessageSigned<T> | StreamMessageEncrypted<T>> {
        // streamId as queue key
        return this.queue(streamId, async () => {
            // load cached stream + publisher details
            const [streamPartition, publisherId] = await Promise.all([
                this.streamPartitioner.compute(streamId, partitionKey),
                this.ethereum.getAddress(),
            ])

            const spid = SPID.from({ streamId, streamPartition })

            // chain messages
            const chain = this.getMsgChain(spid, {
                publisherId, msgChainId
            })

            const [messageId, prevMsgRef] = chain.add(timestamp)

            const streamMessage: StreamMessage<T> = (content && 'toStreamMessage' in content && typeof content.toStreamMessage === 'function')
                // @ts-expect-error TODO: typing for stream message containers
                ? ((content.toStreamMessage(messageId, prevMsgRef)) as StreamMessage<T>)
                : new StreamMessage({
                    messageId,
                    prevMsgRef,
                    content,
                    ...opts
                })

            // if (StreamMessage.isUnencrypted(streamMessage)) {
            // await this.encrypt(streamMessage, stream)
            // }

            if (StreamMessage.isUnsigned(streamMessage)) {
                await this.signer.sign(streamMessage)
            }

            return streamMessage
        })
    }
    /*
    setNextGroupKey(maybeStreamId: string, newKey: GroupKey) {
        return this.encrypt.setNextGroupKey(maybeStreamId, newKey)
    }

    rotateGroupKey(maybeStreamId: string) {
        return this.encrypt.rotateGroupKey(maybeStreamId)
    }

    rekey(maybeStreamId: string) {
        return this.encrypt.rekey(maybeStreamId)
    }

    startKeyExchange() {
        return this.encrypt.start()
    }
    */

    async stop() {
        this.streamPartitioner.clear()
        this.queue.clear()
        this.getMsgChain.clear()
        // await this.encrypt.stop()
    }
}

import { inject, scoped, Lifecycle } from 'tsyringe'
import { StreamMessage, SPID, SID, MessageContent, StreamMessageEncrypted, StreamMessageSigned } from 'streamr-client-protocol'

import { LimitAsyncFnByKey } from '../utils'

import Signer from './Signer'
// import Encrypt from './Encrypt'
// import { GroupKey } from '../stream'
import { getCachedMesssageChainer } from './MessageChainer'
import StreamPartitioner from '../publish/StreamPartitioner'
import { Config, CacheConfig } from './Config'
import { BrubeckCached } from './Cached'
import Ethereum from './Ethereum'

export type MessageCreateOptions<T extends MessageContent> = {
    content: T
    timestamp: string | number | Date
    partitionKey?: string | number
    msgChainId?: string
}

export interface IMessageCreator {
    create: <T extends MessageContent>(sid: SID, options: MessageCreateOptions<T>) => Promise<StreamMessage<T>>
    stop: () => Promise<void> | void
}

export class StreamMessageCreatorAnonymous implements IMessageCreator {
    // eslint-disable-next-line class-methods-use-this
    async create<T extends MessageContent>(_sid: SID, _options: MessageCreateOptions<T>): Promise<StreamMessage<T>> {
        throw new Error('Anonymous user can not publish.')
    }

    // eslint-disable-next-line class-methods-use-this
    stop() {}
}

@scoped(Lifecycle.ContainerScoped)
export default class StreamMessageCreator implements IMessageCreator {
    computeStreamPartition
    // encrypt
    queue: ReturnType<typeof LimitAsyncFnByKey>
    getMsgChainer

    /*
     * Get function for creating stream messages.
     */

    constructor(
        private signer: Signer,
        private ethereum: Ethereum,
        private streamEndpoints: BrubeckCached,
        @inject(Config.Cache) private cacheOptions: CacheConfig,
    ) {
        this.computeStreamPartition = StreamPartitioner(this.cacheOptions)
        this.getMsgChainer = getCachedMesssageChainer(this.cacheOptions)
        // this.encrypt = Encrypt(client)

        // per-stream queue so messages processed in-order
        this.queue = LimitAsyncFnByKey(1)
    }

    async create<T extends MessageContent>(streamObjectOrId: SID, {
        content,
        timestamp,
        partitionKey,
        msgChainId,
        ...opts
    }: MessageCreateOptions<T>): Promise<StreamMessageSigned<T> | StreamMessageEncrypted<T>> {
        const spidObject = SPID.parse(streamObjectOrId)
        const { streamId } = spidObject
        // streamId as queue key
        return this.queue(streamId, async () => {
            // load cached stream + publisher details
            const [stream, publisherId] = await Promise.all([
                this.streamEndpoints.getStream(streamId),
                this.ethereum.getAddress(),
            ])

            // figure out partition
            const definedPartition = spidObject.streamPartition
            if ((definedPartition !== undefined) && (partitionKey !== undefined)) {
                throw new Error('Invalid combination of "partition" and "partitionKey"')
            }
            const streamPartition = definedPartition ?? this.computeStreamPartition(stream.partitions, partitionKey ?? 0)
            const spid = SPID.from({ streamId, streamPartition })

            // chain messages
            const chain = this.getMsgChainer(spid, {
                publisherId, msgChainId
            })

            const timestampAsNumber = timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp).getTime()
            const [messageId, prevMsgRef] = chain.add(timestampAsNumber)

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
        this.computeStreamPartition.clear()
        this.queue.clear()
        this.getMsgChainer.clear()
        // await this.encrypt.stop()
    }
}

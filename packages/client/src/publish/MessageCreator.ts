import { StreamMessage, SPID, SID, MessageContent, StreamMessageEncrypted, StreamMessageSigned } from 'streamr-client-protocol'
import mem from 'mem'

import { LimitAsyncFnByKey } from '../utils'

import Signer from './Signer'
import Encrypt from './Encrypt'
import { GroupKey } from '../stream'
import MessageChainer from './MessageChainer'
import StreamPartitioner from './StreamPartitioner'
import { StreamrClientAuthenticated } from '../StreamrClient'

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

export default class StreamMessageCreator implements IMessageCreator {
    computeStreamPartition
    encrypt
    queue: ReturnType<typeof LimitAsyncFnByKey>
    getMsgChainer: typeof MessageChainer & { clear: () => void }
    signStreamMessage
    client

    /*
     * Get function for creating stream messages.
     */

    constructor(client: StreamrClientAuthenticated) {
        const cacheOptions = client.options.cache
        this.client = client
        this.computeStreamPartition = StreamPartitioner(cacheOptions)
        this.encrypt = Encrypt(client)

        // one chainer per streamId + streamPartition + publisherId + msgChainId
        this.getMsgChainer = Object.assign(mem(MessageChainer, {
            cacheKey: ([spid, { publisherId, msgChainId }]) => (
                // empty msgChainId is fine
                [spid.key, publisherId, msgChainId ?? ''].join('|')
            ),
            ...cacheOptions,
            maxAge: undefined
        }), {
            clear: () => {
                mem.clear(this.getMsgChainer)
            }
        })

        // message signer
        this.signStreamMessage = Signer(client.options.auth)
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
                this.client.cached.getStream(streamId),
                this.client.cached.getAddress(),
            ])

            // figure out partition
            const definedPartition = spidObject.streamPartition
            if ((definedPartition !== undefined) && (partitionKey !== undefined)) {
                throw new Error('Invalid combination of "partition" and "partitionKey"')
            }
            const streamPartition = definedPartition ?? this.computeStreamPartition(stream.partitions, partitionKey ?? 0)
            const spid = SPID.from({ streamId, streamPartition })

            // chain messages
            const chainMessage = this.getMsgChainer(spid, {
                publisherId, msgChainId
            })

            const timestampAsNumber = timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp).getTime()
            const [messageId, prevMsgRef] = chainMessage(timestampAsNumber)

            const streamMessage: StreamMessage<T> = (content && 'toStreamMessage' in content && typeof content.toStreamMessage === 'function')
                // @ts-expect-error TODO: typing for stream message containers
                ? ((content.toStreamMessage(messageId, prevMsgRef)) as StreamMessage<T>)
                : new StreamMessage({
                    messageId,
                    prevMsgRef,
                    content,
                    ...opts
                })

            if (StreamMessage.isUnencrypted(streamMessage)) {
                await this.encrypt(streamMessage, stream)
            }

            if (StreamMessage.isUnsigned(streamMessage)) {
                await this.signStreamMessage(streamMessage)
            }

            return streamMessage
        })
    }

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

    async stop() {
        this.computeStreamPartition.clear()
        this.queue.clear()
        this.getMsgChainer.clear()
        await this.encrypt.stop()
    }
}


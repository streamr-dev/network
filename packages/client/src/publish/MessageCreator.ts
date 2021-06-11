import { StreamMessage } from 'streamr-client-protocol'
import mem from 'mem'

import { LimitAsyncFnByKey } from '../utils'

import Signer, { AuthOption } from './Signer'
import Encrypt from './Encrypt'
import { GroupKey } from '../stream'
import { StreamrClient } from '../StreamrClient'
import MessageChainer from './MessageChainer'
import StreamPartitioner from './StreamPartitioner'
import { StreamIDish, getStreamId } from './utils'

export default class StreamMessageCreator {
    computeStreamPartition
    encrypt
    queue: ReturnType<typeof LimitAsyncFnByKey>
    getMsgChainer: typeof MessageChainer & { clear: () => void }
    signStreamMessage
    client

    /*
     * Get function for creating stream messages.
     */

    constructor(client: StreamrClient) {
        const cacheOptions = client.options.cache
        this.client = client
        this.computeStreamPartition = StreamPartitioner(cacheOptions)
        this.encrypt = Encrypt(client)

        // one chainer per streamId + streamPartition + publisherId + msgChainId
        this.getMsgChainer = Object.assign(mem(MessageChainer, {
            cacheKey: ([{ streamId, streamPartition, publisherId, msgChainId }]) => (
                // undefined msgChainId is fine
                [streamId, streamPartition, publisherId, msgChainId].join('|')
            ),
            ...cacheOptions,
            maxAge: undefined
        }), {
            clear: () => {
                mem.clear(this.getMsgChainer)
            }
        })

        // message signer
        this.signStreamMessage = Signer({
            ...client.options.auth,
        } as AuthOption, client.options.publishWithSignature)

        // per-stream queue so messages processed in-order
        this.queue = LimitAsyncFnByKey(1)
    }

    create(streamObjectOrId: StreamIDish, {
        content,
        timestamp,
        partitionKey = 0,
        msgChainId,
        ...opts
    }: {
        content: any,
        timestamp: string | number | Date,
        partitionKey?: string | number,
        msgChainId?: string,
    }): Promise<StreamMessage> {
        const streamId = getStreamId(streamObjectOrId)
        // streamId as queue key
        return this.queue(streamId, async () => {
            // load cached stream + publisher details
            const [stream, publisherId] = await Promise.all([
                this.client.cached.getStream(streamId),
                this.client.cached.getUserId(this.client),
            ])

            // figure out partition
            const streamPartition = this.computeStreamPartition(stream.partitions, partitionKey)

            // chain messages
            const chainMessage = this.getMsgChainer({
                streamId, streamPartition, publisherId, msgChainId
            })

            const timestampAsNumber = timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp).getTime()
            const [messageId, prevMsgRef] = chainMessage(timestampAsNumber)

            const streamMessage = (content && typeof content.toStreamMessage === 'function')
                ? content.toStreamMessage(messageId, prevMsgRef)
                : new StreamMessage({
                    messageId,
                    prevMsgRef,
                    content,
                    ...opts
                })

            await this.encrypt(streamMessage, stream)
            // sign, noop if not needed
            await this.signStreamMessage(streamMessage)

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

    clear() {
        this.computeStreamPartition.clear()
        this.queue.clear()
    }
}


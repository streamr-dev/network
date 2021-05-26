import { inspect } from 'util'
import crypto from 'crypto'

import { ControlLayer, MessageRef, StreamMessage, MessageID, PublishRequest } from 'streamr-client-protocol'
import mem from 'mem'

import { uuid, CacheFn, LimitAsyncFnByKey, randomString } from '../utils'
import { waitForRequestResponse } from '../stream/utils'

import Signer, { AuthOption } from './Signer'
import Encrypt from './Encrypt'
import { GroupKey, Stream, StreamPartDefinition } from '../stream'
import type { StreamrClientOptions } from '../Config'
import { StreamrClient } from '../StreamrClient'

export class FailedToPublishError extends Error {
    streamId
    msg
    reason
    constructor(streamId: string, msg: string, reason?: Error) {
        super(`Failed to publish to stream ${streamId} due to: ${reason && reason.stack ? reason.stack : reason}. Message was: ${inspect(msg)}`)
        this.streamId = streamId
        this.msg = msg
        this.reason = reason
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}

type StreamIDish = Stream | StreamPartDefinition | string

function getStreamId(streamObjectOrId: StreamIDish) {
    if (streamObjectOrId && typeof streamObjectOrId === 'string') {
        return streamObjectOrId
    }

    if (typeof streamObjectOrId === 'object') {
        if ('streamId' in streamObjectOrId && streamObjectOrId.streamId != null) {
            return streamObjectOrId.streamId
        }

        if ('id' in streamObjectOrId && streamObjectOrId.id != null) {
            return streamObjectOrId.id
        }
    }

    throw new Error(`First argument must be a Stream object or the stream id! Was: ${inspect(streamObjectOrId)}`)
}

function hash(stringToHash: string) {
    return crypto.createHash('md5').update(stringToHash).digest()
}

function MessageChainer(
    { streamId, streamPartition, publisherId, msgChainId = randomString(20) }:
    { streamId: string, streamPartition: number, publisherId: string, msgChainId?: string }
) {
    let prevMsgRef: MessageRef | undefined

    /**
     * Generate the next message MessageID + previous MessageRef for this message chain.
     * Messages with same timestamp get incremented sequence numbers.
     */

    return function add(timestamp: number): [MessageID, MessageRef | undefined] {
        // NOTE: publishing back-dated (i.e. non-sequentially timestamped) messages will 'break' sequencing.
        // i.e. we lose track of biggest sequence number whenever timestamp changes for stream id+partition combo
        // so backdated messages will start at sequence 0 again, regardless of the sequencing of existing messages.
        // storage considers timestamp+sequence number unique, so the newer messages will clobber the older messages
        // Not feasible to keep greatest sequence number for every millisecond timestamp so not sure a good way around this.
        // Possible we should keep a global sequence number
        const isSameTimestamp = prevMsgRef && prevMsgRef.timestamp === timestamp
        const isBackdated = prevMsgRef && prevMsgRef.timestamp > timestamp
        // increment if timestamp the same, otherwise 0
        const nextSequenceNumber = isSameTimestamp ? prevMsgRef!.sequenceNumber + 1 : 0
        const messageId = new MessageID(streamId, streamPartition, timestamp, nextSequenceNumber, publisherId, msgChainId)
        // update latest timestamp + sequence for this streamId+partition
        // (see note above about clobbering sequencing)
        // don't update latest if timestamp < previous timestamp
        // this "fixes" the sequence breaking issue above, but this message will silently disappear
        const currentPrevMsgRef = prevMsgRef
        if (!isBackdated) {
            prevMsgRef = new MessageRef(timestamp, nextSequenceNumber)
        }
        return [messageId, currentPrevMsgRef]
    }
}

function StreamPartitioner(cacheOptions: StreamrClientOptions['cache']) {
    const cachedHash = CacheFn(hash, cacheOptions)
    function computeStreamPartition(partitionCount: number, partitionKey: string | number) {
        if (!(Number.isSafeInteger(partitionCount) && partitionCount > 0)) {
            throw new Error(`partitionCount is not a safe positive integer! ${partitionCount}`)
        }

        if (partitionCount === 1) {
            // Fast common case
            return 0
        }

        if (typeof partitionKey === 'number') {
            return Math.abs(partitionKey) % partitionCount
        }

        if (!partitionKey) {
            // Fallback to random partition if no key
            return Math.floor(Math.random() * partitionCount)
        }

        const buffer = cachedHash(partitionKey)
        const intHash = buffer.readInt32LE()
        return Math.abs(intHash) % partitionCount
    }

    computeStreamPartition.clear = cachedHash.clear
    return computeStreamPartition
}

class StreamMessageCreator {
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
    }) {
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

/**
 * Add handle to keep connection open while publishing.
 * Refreshes handle timeout on each call.
 * Only remove publish handle after inactivity of options.publishAutoDisconnectDelay ms.
 */

const PUBLISH_HANDLE = Symbol('publish')

const setupPublishHandleTimeouts: WeakMap<StreamrClient, ReturnType<typeof setTimeout>> = new WeakMap()
async function setupPublishHandle(client: StreamrClient) {
    const clearConnectionTimeout = () => clearTimeout(setupPublishHandleTimeouts.get(client)!)
    try {
        clearConnectionTimeout()
        client.connection.addListener('done', clearConnectionTimeout)
        await client.connection.addHandle(PUBLISH_HANDLE)
    } finally {
        const { publishAutoDisconnectDelay = 5000 } = client.options
        clearConnectionTimeout()
        setupPublishHandleTimeouts.set(client, setTimeout(async () => { // eslint-disable-line require-atomic-updates
            try {
                await client.connection.removeHandle(PUBLISH_HANDLE)
            } catch (err) {
                client.emit('error', err)
            }
        }, publishAutoDisconnectDelay || 0))
    }
}

export default class Publisher {
    debug
    sendQueue: ReturnType<typeof LimitAsyncFnByKey>
    streamMessageCreator
    onErrorEmit
    client
    constructor(client: StreamrClient) {
        this.client = client
        this.debug = client.debug.extend('Publisher')
        this.sendQueue = LimitAsyncFnByKey(1)
        this.streamMessageCreator = new StreamMessageCreator(client)
        this.onErrorEmit = client.getErrorEmitter({
            debug: this.debug
        })
    }

    async listenForErrors(request: PublishRequest) {
        // listen for errors for this request for 3s
        return waitForRequestResponse(this.client, request, {
            timeout: 3000,
            rejectOnTimeout: false,
        })
    }

    async publishMessage(streamObjectOrId: StreamIDish, {
        content,
        timestamp = new Date(),
        partitionKey
    }: {
        content: any
        timestamp?: string | number | Date
        partitionKey?: string | number
    }) {
        if (this.client.session.isUnauthenticated()) {
            throw new Error('Need to be authenticated to publish.')
        }

        const streamId = getStreamId(streamObjectOrId)

        // get session, connection + generate stream message in parallel
        // NOTE: createStreamMessage *must* be executed in publish() call order or sequencing will be broken.
        // i.e. don't do anything async before calling createStreamMessage

        const asyncDepsTask = Promise.all([ // intentional no await
            // no async before running createStreamMessage
            this.streamMessageCreator.create(streamObjectOrId, {
                content,
                timestamp,
                partitionKey,
            }),
            this.client.session.getSessionToken(), // fetch in parallel
            setupPublishHandle(this.client),
        ])

        // no async before running sendQueue
        return this.sendQueue(streamId, async () => {
            const [streamMessage, sessionToken] = await asyncDepsTask
            const requestId = uuid('pub')
            const request = new ControlLayer.PublishRequest({
                streamMessage,
                requestId,
                sessionToken: sessionToken || null,
            })

            this.listenForErrors(request).catch(this.onErrorEmit) // unchained async

            // send calls should probably also fire in-order otherwise new realtime streams
            // can miss messages that are sent late
            await this.client.send(request)
            return request
        })
    }

    async publish(streamObjectOrId: StreamIDish, content: any, timestamp?: string | number | Date, partitionKey?: string | number) {
        // wrap publish in error emitter
        try {
            return await this.publishMessage(streamObjectOrId, {
                content,
                timestamp,
                partitionKey,
            })
        } catch (err) {
            const streamId = getStreamId(streamObjectOrId)
            const error = new FailedToPublishError(
                streamId,
                content,
                err
            )
            this.onErrorEmit(error)
            throw error
        }
    }

    async startKeyExchange() {
        return this.streamMessageCreator.startKeyExchange()
    }

    async stop() {
        this.sendQueue.clear()
        this.streamMessageCreator.clear()
    }

    rotateGroupKey(streamId: string) {
        return this.streamMessageCreator.rotateGroupKey(streamId)
    }

    setNextGroupKey(streamId: string, newKey: GroupKey) {
        return this.streamMessageCreator.setNextGroupKey(streamId, newKey)
    }

    rekey(streamId: string) {
        return this.streamMessageCreator.rekey(streamId)
    }
}

import { inspect } from 'util'
import crypto from 'crypto'

import { ControlLayer, MessageLayer } from 'streamr-client-protocol'
import randomstring from 'randomstring'
import mem from 'mem'
import { ethers } from 'ethers'

import { uuid, CacheAsyncFn, CacheFn, LimitAsyncFnByKey } from '../utils'
import { validateOptions, waitForRequestResponse } from '../stream/utils'

import Signer from './Signer'

export class FailedToPublishError extends Error {
    constructor(streamId, msg, reason) {
        super(`Failed to publish to stream ${streamId} due to: ${reason}. Message was: ${inspect(msg)}`)
        this.streamId = streamId
        this.msg = msg
        this.reason = reason
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}

const { StreamMessage, MessageID, MessageRef } = MessageLayer

function getStreamId(streamObjectOrId) {
    if (streamObjectOrId.streamId != null) {
        return streamObjectOrId.streamId
    }

    if (streamObjectOrId.id != null) {
        return streamObjectOrId.id
    }

    if (streamObjectOrId && typeof streamObjectOrId === 'string') {
        return streamObjectOrId
    }

    throw new Error(`First argument must be a Stream object or the stream id! Was: ${inspect(streamObjectOrId)}`)
}

function hash(stringToHash) {
    return crypto.createHash('md5').update(stringToHash).digest()
}

function MessageChainer({ streamId, streamPartition, publisherId, msgChainId = randomstring.generate(20) } = {}) {
    let prevMsgRef = null

    /**
     * Generate the next message MessageID + previous MessageRef for this message chain.
     * Messages with same timestamp get incremented sequence numbers.
     */

    return function add(timestamp) {
        // NOTE: publishing back-dated (i.e. non-sequentially timestamped) messages will 'break' sequencing.
        // i.e. we lose track of biggest sequence number whenever timestamp changes for stream id+partition combo
        // so backdated messages will start at sequence 0 again, regardless of the sequencing of existing messages.
        // storage considers timestamp+sequence number unique, so the newer messages will clobber the older messages
        // Not feasible to keep greatest sequence number for every millisecond timestamp so not sure a good way around this.
        // Possible we should keep a global sequence number
        const isSameTimestamp = prevMsgRef && prevMsgRef.timestamp === timestamp
        const isBackdated = prevMsgRef && prevMsgRef.timestamp > timestamp
        // increment if timestamp the same, otherwise 0
        const nextSequenceNumber = isSameTimestamp ? prevMsgRef.sequenceNumber + 1 : 0
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

function StreamPartitioner(cacheOptions) {
    const cachedHash = CacheFn(hash, cacheOptions)
    function computeStreamPartition(partitionCount, partitionKey) {
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

async function getUsername(client) {
    const { options: { auth = {} } = {} } = client
    if (auth.username) { return auth.username }

    const { username, id } = await client.getUserInfo()
    return (
        username
        // edge case: if auth.apiKey is an anonymous key, userInfo.id is that anonymous key
        || id
    )
}

async function getPublisherId(client) {
    if (client.session.isUnauthenticated()) {
        throw new Error('Need to be authenticated to getPublisherId.')
    }

    const { options: { auth = {} } = {} } = client
    if (auth.privateKey) {
        return ethers.utils.computeAddress(auth.privateKey).toLowerCase()
    }

    if (auth.provider) {
        const provider = new ethers.providers.Web3Provider(auth.provider)
        return provider.getSigner().address.toLowerCase()
    }

    const username = await getUsername(client)

    if (username != null) {
        const hexString = ethers.utils.hexlify(Buffer.from(username, 'utf8'))
        return ethers.utils.sha256(hexString)
    }

    throw new Error('Need either "privateKey", "provider", "apiKey", "username"+"password" or "sessionToken" to derive the publisher Id.')
}

const PUBLISH_HANDLE = Symbol('publish')

/*
 * Get function for creating stream messages.
 */

function getCreateStreamMessage(client) {
    const cacheOptions = client.options.cache
    const computeStreamPartition = StreamPartitioner(cacheOptions)
    // one chainer per stream+partition
    const getMsgChainer = mem(MessageChainer, {
        cacheKey: ({ streamId, streamPartition, publisherId, msgChainId }) => (
            [streamId, streamPartition, publisherId, msgChainId].join('|')
        )
    })

    getMsgChainer.clear = () => mem.clear(getMsgChainer)

    const signStreamMessage = Signer({
        ...client.options.auth,
        debug: client.debug,
    }, client.options.publishWithSignature)

    // cache stream + publisher details
    const getCachedStream = CacheAsyncFn(client.getStream.bind(client), cacheOptions)
    const getCachedPublisherId = CacheAsyncFn(getPublisherId, cacheOptions)

    // per-stream queue so messages processed in-order
    const queue = LimitAsyncFnByKey(1)

    function createStreamMessage(streamObjectOrId, {
        content,
        timestamp,
        partitionKey,
        msgChainId,
        ...opts
    }) {
        const streamId = getStreamId(streamObjectOrId)
        // streamId as queue key
        return queue(streamId, async () => {
            // load cached stream + publisher details
            const [stream, publisherId] = await Promise.all([
                getCachedStream(streamId),
                getCachedPublisherId(client),
            ])

            // figure out partition
            const streamPartition = computeStreamPartition(stream.partitions, partitionKey)

            // chain messages
            const chainMessage = getMsgChainer({
                streamId, streamPartition, publisherId, msgChainId
            })

            const timestampAsNumber = timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp).getTime()
            const [messageId, prevMsgRef] = chainMessage(timestampAsNumber)

            const streamMessage = new StreamMessage({
                messageId,
                prevMsgRef,
                content,
                ...opts
            })

            // sign, noop if not needed
            await signStreamMessage(streamMessage)

            return streamMessage
        })
    }

    return Object.assign(createStreamMessage, {
        getCachedPublisherId,
        clear() {
            computeStreamPartition.clear()
            getCachedStream.clear()
            getCachedPublisherId.clear()
            getMsgChainer.clear()
            queue.clear()
        }
    })
}

export default class Publisher {
    constructor(client) {
        this.client = client
        this.debug = client.debug.extend('Publisher')
        this.sendQueue = LimitAsyncFnByKey(1)
        this.createStreamMessage = getCreateStreamMessage(client)
        this.onConnectionDone = this.onConnectionDone.bind(this)
        this.onErrorEmit = this.client.getErrorEmitter(this)
    }

    async publish(...args) {
        this.debug('publish()')
        // wrap publish in error emitter
        return this._publish(...args).catch((err) => {
            this.onErrorEmit(err)
            throw err
        })
    }

    async createPublishRequest(streamObjectOrId, content, timestamp = new Date(), partitionKey) {
        const requestId = uuid('pub')

        // get session, connection + generate stream message
        // important: stream message call must be executed in publish() call order
        // or sequencing will be broken.
        const [streamMessage, sessionToken] = await Promise.all([
            this.createStreamMessage(streamObjectOrId, {
                content,
                timestamp,
                partitionKey
            }),
            this.client.session.getSessionToken(), // fetch in parallel
            this.setupPublishHandle(),
        ])

        return new ControlLayer.PublishRequest({
            streamMessage,
            requestId,
            sessionToken,
        })
    }

    async _publish(streamObjectOrId, content, timestamp = new Date(), partitionKey = null) {
        this.debug('publish()')
        if (this.client.session.isUnauthenticated()) {
            throw new Error('Need to be authenticated to publish.')
        }

        const { key } = validateOptions(streamObjectOrId)
        let request

        try {
            // start request task
            const requestTask = this.createPublishRequest(streamObjectOrId, content, timestamp, partitionKey)
            await this.sendQueue(key, async () => {
                // but don't sent until send queue empty & request created
                request = await requestTask
                // listen for errors for this request for 3s
                waitForRequestResponse(this.client, request, {
                    timeout: 3000,
                    rejectOnTimeout: false,
                }).catch((err) => {
                    // TODO: handle resending failed
                    this.onErrorEmit(err)
                })

                await this.client.send(request)
                // send calls should probably also fire in-order otherwise new realtime streams
                // can miss messages that are sent late
            })
        } catch (err) {
            const streamId = getStreamId(streamObjectOrId)
            throw new FailedToPublishError(
                streamId,
                content,
                err
            )
        }

        return request
    }

    /**
     * Add handle to keep connection open while publishing.
     * Refreshes handle timeout on each call.
     * Only remove publish handle after inactivity of options.publishAutoDisconnectDelay ms.
     */

    async setupPublishHandle() {
        try {
            clearTimeout(this._publishHandleTimeout)
            this.client.connection.addListener('done', this.onConnectionDone)
            await this.client.connection.addHandle(PUBLISH_HANDLE)
        } finally {
            const { publishAutoDisconnectDelay = 5000 } = this.client.options
            clearTimeout(this._publishHandleTimeout)
            this._publishHandleTimeout = setTimeout(async () => {
                try {
                    await this.client.connection.removeHandle(PUBLISH_HANDLE)
                } catch (err) {
                    this.client.emit('error', err)
                }
            }, publishAutoDisconnectDelay || 0)
        }
    }

    /**
     * Clean up handle on connection done
     */

    onConnectionDone() {
        clearTimeout(this._publishHandleTimeout)
    }

    async getPublisherId() {
        if (this.client.session.isUnauthenticated()) {
            throw new Error('Need to be authenticated to getPublisherId.')
        }
        return this.createStreamMessage.getCachedPublisherId()
    }

    stop() {
        this.sendQueue.clear()
        this.createStreamMessage.clear()
    }
}

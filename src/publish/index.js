import { inspect } from 'util'
import crypto from 'crypto'

import { ControlLayer, MessageLayer } from 'streamr-client-protocol'
import randomstring from 'randomstring'
import LRU from 'quick-lru'
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

/**
 * Message Chain Sequencing
 */

class MessageChainSequence {
    constructor({ maxSize = 10000 } = {}) {
        this.msgChainId = randomstring.generate(20)
        // tracks previous timestamp+sequence for stream+partition
        this.messageRefs = new LRU({
            maxSize, // should never exceed this except in pathological cases
        })
    }

    /**
     * Generate the next message MessageID + previous MessageRef for this message chain.
     * Messages with same timestamp get incremented sequence numbers.
     */

    add({ streamId, streamPartition, timestamp, publisherId, }) {
        // NOTE: publishing back-dated (i.e. non-sequentially timestamped) messages will 'break' sequencing.
        // i.e. we lose track of biggest sequence number whenever timestamp changes for stream id+partition combo
        // so backdated messages will start at sequence 0 again, regardless of the sequencing of existing messages.
        // storage considers timestamp+sequence number unique, so the newer messages will clobber the older messages
        // Not feasible to keep greatest sequence number for every millisecond timestamp so not sure a good way around this.
        // Possible we should keep a global sequence number
        const key = `${streamId}|${streamPartition}`
        const prevMsgRef = this.messageRefs.get(key)
        const isSameTimestamp = prevMsgRef && prevMsgRef.timestamp === timestamp
        const isBackdated = prevMsgRef && prevMsgRef.timestamp > timestamp
        // increment if timestamp the same, otherwise 0
        const nextSequenceNumber = isSameTimestamp ? prevMsgRef.sequenceNumber + 1 : 0
        const messageId = new MessageID(streamId, streamPartition, timestamp, nextSequenceNumber, publisherId, this.msgChainId)
        // update latest timestamp + sequence for this streamId+partition
        // (see note above about clobbering sequencing)
        // don't update latest if timestamp < previous timestamp
        // this "fixes" the sequence breaking issue above, but this message will silently disappear
        if (!isBackdated) {
            this.messageRefs.set(key, new MessageRef(timestamp, nextSequenceNumber))
        }
        return [messageId, prevMsgRef]
    }

    clear() {
        this.messageRefs.clear()
    }
}

/**
 * Computes appropriate stream partition
 */

export class StreamPartitioner {
    constructor(client) {
        this.client = client
        const cacheOptions = client.options.cache
        this._getStreamPartitions = CacheAsyncFn(this._getStreamPartitions.bind(this), cacheOptions)
        this.hash = CacheFn(hash, cacheOptions)
    }

    clear() {
        this._getStreamPartitions.clear()
        this.hash.clear()
    }

    /**
     * Get partition for given stream/streamId + partitionKey
     */

    async get(streamObjectOrId, partitionKey) {
        const streamPartitions = await this.getStreamPartitions(streamObjectOrId)
        return this.computeStreamPartition(streamPartitions, partitionKey)
    }

    async getStreamPartitions(streamObjectOrId) {
        if (streamObjectOrId && streamObjectOrId.partitions != null) {
            return streamObjectOrId.partitions
        }

        // get streamId here so caching based on id works
        const streamId = getStreamId(streamObjectOrId)
        return this._getStreamPartitions(streamId)
    }

    async _getStreamPartitions(streamId) {
        const { partitions } = await this.client.getStream(streamId)
        return partitions
    }

    computeStreamPartition(partitionCount, partitionKey) {
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

        const buffer = this.hash(partitionKey)
        const intHash = buffer.readInt32LE()
        return Math.abs(intHash) % partitionCount
    }
}

export class MessageCreationUtil {
    constructor(client) {
        this.client = client
        const cacheOptions = client.options.cache
        this.msgChainer = new MessageChainSequence(cacheOptions)
        this.partitioner = new StreamPartitioner(client)
        this.getUserInfo = CacheAsyncFn(this.getUserInfo.bind(this), cacheOptions)
        this.getPublisherId = CacheAsyncFn(this.getPublisherId.bind(this), cacheOptions)
        this.queue = LimitAsyncFnByKey(1) // an async queue for each stream's async deps
    }

    stop() {
        this.msgChainer.clear()
        this.getUserInfo.clear()
        this.getPublisherId.clear()
        this.partitioner.clear()
        this.queue.clear()
    }

    async getPublisherId() {
        const { options: { auth = {} } = {} } = this.client
        if (auth.privateKey !== undefined) {
            return ethers.utils.computeAddress(auth.privateKey).toLowerCase()
        }

        if (auth.provider !== undefined) {
            const provider = new ethers.providers.Web3Provider(auth.provider)
            return provider.getSigner().address.toLowerCase()
        }

        const username = auth.username || await this.getUsername()

        if (username !== undefined) {
            const hexString = ethers.utils.hexlify(Buffer.from(username, 'utf8'))
            return ethers.utils.sha256(hexString)
        }

        throw new Error('Need either "privateKey", "provider", "apiKey", "username"+"password" or "sessionToken" to derive the publisher Id.')
    }

    /* cached remote call */
    async getUserInfo() {
        return this.client.getUserInfo()
    }

    async getUsername() {
        const { username, id } = await this.client.getUserInfo()
        return (
            username
            // edge case: if auth.apiKey is an anonymous key, userInfo.id is that anonymous key
            || id
        )
    }

    async createStreamMessage(streamObjectOrId, options = {}) {
        const { content } = options
        // Validate content
        if (typeof content !== 'object') {
            throw new Error(`Message content must be an object! Was: ${inspect(content)}`)
        }

        // queued depdendencies fetching
        const [publisherId, streamPartition] = await this._getDependencies(streamObjectOrId, options)
        return this._createStreamMessage(getStreamId(streamObjectOrId), {
            publisherId,
            streamPartition,
            ...options
        })
    }

    /**
     * Fetch async dependencies for publishing.
     * Should resolve in call-order per-stream to guarantee correct sequencing.
     */

    async _getDependencies(streamObjectOrId, { partitionKey }) {
        // This queue guarantees stream messages for the same timestamp are sequenced in-order
        // regardless of the async resolution order.
        // otherwise, if async calls happen to resolve in a different order
        // than they were issued we will end up generating the wrong sequence numbers
        const streamId = getStreamId(streamObjectOrId)
        return this.queue(streamId, async () => (
            Promise.all([
                this.getPublisherId(),
                this.partitioner.get(streamObjectOrId, partitionKey),
            ])
        ))
    }

    /**
     * Synchronously generate chain sequence + stream message after async deps resolved.
     */

    _createStreamMessage(streamId, options = {}) {
        const {
            content, streamPartition, timestamp, publisherId, ...opts
        } = options

        const [messageId, prevMsgRef] = this.msgChainer.add({
            streamId,
            streamPartition,
            timestamp,
            publisherId,
        })

        return new StreamMessage({
            messageId,
            prevMsgRef,
            content,
            ...opts
        })
    }
}

const PUBLISH_HANDLE = Symbol('publish')

export default class Publisher {
    constructor(client) {
        this.client = client
        this.debug = client.debug.extend('Publisher')
        this.msgQueue = LimitAsyncFnByKey(1)
        this.sendQueue = LimitAsyncFnByKey(1)

        this.onConnectionDone = this.onConnectionDone.bind(this)

        this.signer = Signer.createSigner({
            ...client.options.auth,
            debug: client.debug,
        }, client.options.publishWithSignature)

        this.onErrorEmit = this.client.getErrorEmitter(this)

        if (client.session.isUnauthenticated()) {
            this.msgCreationUtil = null
        } else {
            this.msgCreationUtil = new MessageCreationUtil(this.client)
        }
    }

    async publish(...args) {
        this.debug('publish()')
        // wrap publish in error emitter
        return this._publish(...args).catch((err) => {
            this.onErrorEmit(err)
            throw err
        })
    }

    async createStreamMessage(streamObjectOrId, content, timestamp = new Date(), partitionKey = null) {
        const { key } = validateOptions(streamObjectOrId)
        const timestampAsNumber = timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp).getTime()
        return this.msgQueue(key, async () => (
            this.msgCreationUtil.createStreamMessage(streamObjectOrId, {
                content,
                timestamp: timestampAsNumber,
                partitionKey
            })
        )).then(async (msg) => {
            // do this here so can happen in parallel with connection/session
            if (this.signer) {
                // optional
                await this.signer.signStreamMessage(msg)
            }
            return msg
        })
    }

    async createPublishRequest(streamObjectOrId, content, timestamp = new Date(), partitionKey = null) {
        const requestId = uuid('pub')

        // get session, connection + generate stream message
        // important: stream message call must be executed in publish() call order
        // or sequencing will be broken.
        const [streamMessage, sessionToken] = await Promise.all([
            this.createStreamMessage(streamObjectOrId, content, timestamp, partitionKey),
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
        return this.msgCreationUtil.getPublisherId()
    }

    stop() {
        if (!this.msgCreationUtil) { return }
        this.msgCreationUtil.stop()
    }
}

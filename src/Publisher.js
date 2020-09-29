import crypto from 'crypto'

import { ControlLayer, MessageLayer } from 'streamr-client-protocol'
import randomstring from 'randomstring'
import LRU from 'quick-lru'
import { ethers } from 'ethers'

import Signer from './Signer'
import Stream from './rest/domain/Stream'
import FailedToPublishError from './errors/FailedToPublishError'
import { uuid, CacheAsyncFn, CacheFn, LimitAsyncFnByKey } from './utils'

const { StreamMessage, MessageID, MessageRef } = MessageLayer

function getStreamId(streamObjectOrId) {
    if (streamObjectOrId instanceof Stream) {
        return streamObjectOrId.id
    }

    if (typeof streamObjectOrId === 'string') {
        return streamObjectOrId
    }

    throw new Error(`First argument must be a Stream object or the stream id! Was: ${streamObjectOrId}`)
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
            throw new Error(`Message content must be an object! Was: ${content}`)
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

export default class Publisher {
    constructor(client) {
        this.client = client
        this.debug = client.debug.extend('Publisher')

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
        // wrap publish in error emitter
        return this._publish(...args).catch((err) => {
            this.onErrorEmit(err)
            throw err
        })
    }

    async _publish(streamObjectOrId, content, timestamp = new Date(), partitionKey = null) {
        this.debug('publish()')
        if (this.client.session.isUnauthenticated()) {
            throw new Error('Need to be authenticated to publish.')
        }

        const timestampAsNumber = timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp).getTime()
        // get session + generate stream message
        // important: stream message call must be executed in publish() call order
        // or sequencing will be broken.
        // i.e. do not put async work before call to createStreamMessage
        const [streamMessage, sessionToken] = await Promise.all([
            this.msgCreationUtil.createStreamMessage(streamObjectOrId, {
                content,
                timestamp: timestampAsNumber,
                partitionKey
            }),
            this.client.session.getSessionToken(), // fetch in parallel
        ])

        if (this.signer) {
            // optional
            await this.signer.signStreamMessage(streamMessage)
        }

        const requestId = uuid('pub')
        const request = new ControlLayer.PublishRequest({
            streamMessage,
            requestId,
            sessionToken,
        })

        try {
            await this.client.send(request)
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

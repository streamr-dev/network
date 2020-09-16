import crypto from 'crypto'

import { ControlLayer, MessageLayer } from 'streamr-client-protocol'
import randomstring from 'randomstring'
import { ethers } from 'ethers'

import Signer from './Signer'
import Stream from './rest/domain/Stream'
import FailedToPublishError from './errors/FailedToPublishError'
import { CacheAsyncFn, CacheFn } from './utils'

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

class OrderedMessageChainCreator {
    constructor() {
        this.msgChainId = randomstring.generate(20)
        this.messageRefs = new Map()
    }

    create({ streamId, streamPartition, timestamp, publisherId, }) {
        const key = `${streamId}|${streamPartition}`
        const prevMsgRef = this.messageRefs.get(key)
        const sequenceNumber = this.getNextSequenceNumber(key, timestamp)
        const messageId = new MessageID(streamId, streamPartition, timestamp, sequenceNumber, publisherId, this.msgChainId)
        this.messageRefs.set(key, new MessageRef(timestamp, sequenceNumber))
        return [messageId, prevMsgRef]
    }

    getNextSequenceNumber(key, timestamp) {
        if (!this.messageRefs.has(key)) { return 0 }
        const prev = this.messageRefs.get(key)
        if (timestamp !== prev.timestamp) {
            return 0
        }
        return prev.sequenceNumber + 1
    }

    clear() {
        this.messageRefs.clear()
    }
}

export class MessageCreationUtil {
    constructor(client) {
        this.client = client
        const cacheOptions = client.options.cache
        this.msgChainer = new OrderedMessageChainCreator(cacheOptions)

        this._getStreamPartitions = CacheAsyncFn(this._getStreamPartitions.bind(this), cacheOptions)
        this.getUserInfo = CacheAsyncFn(this.getUserInfo.bind(this), cacheOptions)
        this.getPublisherId = CacheAsyncFn(this.getPublisherId.bind(this), cacheOptions)
        this.hash = CacheFn(hash, cacheOptions)
    }

    stop() {
        this.msgChainer.clear()
        this.msgChainer = new OrderedMessageChainCreator()
        this.getUserInfo.clear()
        this.getPublisherId.clear()
        this._getStreamPartitions.clear()
        this.hash.clear()
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
        return this.getUserInfo().then((userInfo) => (
            userInfo.username
            || userInfo.id // In the edge case where StreamrClient.auth.apiKey is an anonymous key, userInfo.id is that anonymous key
        ))
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
        if (!partitionCount) {
            throw new Error('partitionCount is falsey!')
        } else if (partitionCount === 1) {
            // Fast common case
            return 0
        } else if (partitionKey) {
            const buffer = this.hash(partitionKey)
            const intHash = buffer.readInt32LE()
            return Math.abs(intHash) % partitionCount
        } else {
            // Fallback to random partition if no key
            return Math.floor(Math.random() * partitionCount)
        }
    }

    async createStreamMessage(streamObjectOrId, { data, timestamp, partitionKey } = {}) {
        // Validate data
        if (typeof data !== 'object') {
            throw new Error(`Message data must be an object! Was: ${data}`)
        }

        const streamId = getStreamId(streamObjectOrId)
        const [streamPartitions, publisherId] = await Promise.all([
            this.getStreamPartitions(streamObjectOrId),
            this.getPublisherId(),
        ])

        const streamPartition = this.computeStreamPartition(streamPartitions, partitionKey)
        const [messageId, prevMsgRef] = this.msgChainer.create({
            streamId,
            streamPartition,
            timestamp,
            publisherId,
        })

        return new StreamMessage({
            messageId,
            prevMsgRef,
            content: data,
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
        this.debug('publish()')

        return this._publish(...args).catch((err) => {
            this.onErrorEmit(err)
            throw err
        })
    }

    async _publish(streamObjectOrId, data, timestamp = new Date(), partitionKey = null) {
        if (this.client.session.isUnauthenticated()) {
            throw new Error('Need to be authenticated to publish.')
        }

        const timestampAsNumber = timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp).getTime()
        const [sessionToken, streamMessage] = await Promise.all([
            this.client.session.getSessionToken(),
            this.msgCreationUtil.createStreamMessage(streamObjectOrId, {
                data,
                timestamp: timestampAsNumber,
                partitionKey
            }),
        ])

        if (this.signer) {
            await this.signer.signStreamMessage(streamMessage)
        }

        const requestId = this.client.resender.resendUtil.generateRequestId()
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
                data,
                err
            )
        }
        return request
    }

    getPublisherId() {
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

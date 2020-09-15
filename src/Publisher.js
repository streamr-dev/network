import crypto from 'crypto'

import { ControlLayer, MessageLayer } from 'streamr-client-protocol'
import randomstring from 'randomstring'
import { ethers } from 'ethers'

import Signer from './Signer'
import Stream from './rest/domain/Stream'
import FailedToPublishError from './errors/FailedToPublishError'
import { AsyncCacheMap, AsyncCacheFn } from './utils'

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

class MessageChainer {
    constructor() {
        this.msgChainId = randomstring.generate(20)
        this.publishedStreams = {}
    }

    create(streamId, streamPartition, timestamp, publisherId) {
        const key = streamId + streamPartition
        if (!this.publishedStreams[key]) {
            this.publishedStreams[key] = {
                prevTimestamp: null,
                prevSequenceNumber: 0,
            }
        }

        const sequenceNumber = this.getNextSequenceNumber(key, timestamp)
        const messageId = new MessageID(streamId, streamPartition, timestamp, sequenceNumber, publisherId, this.msgChainId)
        const prevMsgRef = this.getPrevMsgRef(key)
        this.publishedStreams[key].prevTimestamp = timestamp
        this.publishedStreams[key].prevSequenceNumber = sequenceNumber
        return [messageId, prevMsgRef]
    }

    getPrevMsgRef(key) {
        const prevTimestamp = this.getPrevTimestamp(key)
        if (!prevTimestamp) {
            return null
        }
        const prevSequenceNumber = this.getPrevSequenceNumber(key)
        return new MessageRef(prevTimestamp, prevSequenceNumber)
    }

    getNextSequenceNumber(key, timestamp) {
        if (timestamp !== this.getPrevTimestamp(key)) {
            return 0
        }
        return this.getPrevSequenceNumber(key) + 1
    }

    getPrevTimestamp(key) {
        return this.publishedStreams[key] && this.publishedStreams[key].prevTimestamp
    }

    getPrevSequenceNumber(key) {
        return this.publishedStreams[key].prevSequenceNumber
    }
}

export class MessageCreationUtil {
    constructor(client) {
        this.client = client
        this.msgChainer = new MessageChainer()

        this.streamPartitionCache = new AsyncCacheMap(async (streamId) => {
            const { partitions } = await this.client.getStream(streamId)
            return partitions
        })
        this.getUserInfo = AsyncCacheFn(this.getUserInfo.bind(this))

        this.getPublisherId = AsyncCacheFn(this.getPublisherId.bind(this))
        this.cachedHashes = {}
    }

    stop() {
        this.msgChainer = new MessageChainer()
        this.getUserInfo.stop()
        this.getPublisherId.stop()
        this.streamPartitionCache.stop()
    }

    async getPublisherId() {
        const { auth = {} } = this.client.options
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
        const streamId = getStreamId(streamObjectOrId)
        return this.streamPartitionCache.load(streamId)
    }

    hash(stringToHash) {
        if (this.cachedHashes[stringToHash] === undefined) {
            this.cachedHashes[stringToHash] = crypto.createHash('md5').update(stringToHash).digest()
        }
        return this.cachedHashes[stringToHash]
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
        const [messageId, prevMsgRef] = this.msgChainer.create(streamId, streamPartition, timestamp, publisherId)

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
        return this.msgCreationUtil.getPublisherId()
    }

    stop() {
        return this.msgCreationUtil.stop()
    }
}

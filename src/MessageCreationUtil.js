import crypto from 'crypto'

import Receptacle from 'receptacle'
import randomstring from 'randomstring'
import { MessageLayer } from 'streamr-client-protocol'
import { ethers } from 'ethers'

import Stream from './rest/domain/Stream'
import EncryptionUtil from './EncryptionUtil'
import KeyStorageUtil from './KeyStorageUtil'
import KeyExchangeUtil from './KeyExchangeUtil'
import InvalidGroupKeyRequestError from './errors/InvalidGroupKeyRequestError'
import InvalidGroupKeyResponseError from './errors/InvalidGroupKeyResponseError'
import InvalidContentTypeError from './errors/InvalidContentTypeError'
import { uuid } from './utils'

const { StreamMessage, MessageID, MessageRef } = MessageLayer
const { getKeyExchangeStreamId } = KeyExchangeUtil

export default class MessageCreationUtil {
    constructor(auth, signer, userInfoPromise, getStreamFunction, keyStorageUtil) {
        this.auth = auth
        this._signer = signer
        this.userInfoPromise = userInfoPromise
        this.getStreamFunction = getStreamFunction
        this.cachedStreams = new Receptacle({
            max: 10000,
        })
        this.publishedStreams = {}
        this.keyStorageUtil = keyStorageUtil || KeyStorageUtil.getKeyStorageUtil()
        this.msgChainId = randomstring.generate(20)
        this.cachedHashes = {}
    }

    stop() {
        this.cachedStreams.clear()
    }

    async getUsername() {
        if (!this.usernamePromise) {
            // In the edge case where StreamrClient.auth.apiKey is an anonymous key, userInfo.id is that anonymous key
            this.usernamePromise = this.userInfoPromise.then((userInfo) => userInfo.username || userInfo.id)
        }
        return this.usernamePromise
    }

    async getStream(streamId) {
        if (!this.cachedStreams.get(streamId)) {
            const streamPromise = this.getStreamFunction(streamId).then((stream) => ({
                id: stream.id,
                partitions: stream.partitions,
            }))
            const success = this.cachedStreams.set(streamId, streamPromise, {
                ttl: 30 * 60 * 1000, // 30 minutes
                refresh: true, // reset ttl on access
            })
            if (!success) {
                console.warn(`Could not store stream with id ${streamId} in local cache.`)
                return streamPromise
            }
        }
        return this.cachedStreams.get(streamId)
    }

    async getPublisherId() {
        if (!this.publisherId) {
            if (this.auth.privateKey !== undefined) {
                this.publisherId = ethers.utils.computeAddress(this.auth.privateKey).toLowerCase()
            } else if (this.auth.provider !== undefined) {
                const provider = new ethers.providers.Web3Provider(this.auth.provider)
                this.publisherId = provider.getSigner().address.toLowerCase()
            } else if (this.auth.apiKey !== undefined) {
                const hexString = ethers.utils.hexlify(Buffer.from(await this.getUsername(), 'utf8'))
                this.publisherId = ethers.utils.sha256(hexString)
            } else if (this.auth.username !== undefined) {
                const hexString = ethers.utils.hexlify(Buffer.from(this.auth.username, 'utf8'))
                this.publisherId = ethers.utils.sha256(hexString)
            } else if (this.auth.sessionToken !== undefined) {
                const hexString = ethers.utils.hexlify(Buffer.from(await this.getUsername(), 'utf8'))
                this.publisherId = ethers.utils.sha256(hexString)
            } else {
                throw new Error('Need either "privateKey", "provider", "apiKey", "username"+"password" or "sessionToken" to derive the publisher Id.')
            }
        }
        return this.publisherId
    }

    getNextSequenceNumber(key, timestamp) {
        if (timestamp !== this.getPrevTimestamp(key)) {
            return 0
        }
        return this.getPrevSequenceNumber(key) + 1
    }

    getPrevMsgRef(key) {
        const prevTimestamp = this.getPrevTimestamp(key)
        if (!prevTimestamp) {
            return null
        }
        const prevSequenceNumber = this.getPrevSequenceNumber(key)
        return new MessageRef(prevTimestamp, prevSequenceNumber)
    }

    getPrevTimestamp(key) {
        return this.publishedStreams[key].prevTimestamp
    }

    getPrevSequenceNumber(key) {
        return this.publishedStreams[key].prevSequenceNumber
    }

    async createStreamMessage(streamObjectOrId, data, timestamp = Date.now(), partitionKey = null, groupKey) {
        // Validate data
        if (typeof data !== 'object') {
            throw new Error(`Message data must be an object! Was: ${data}`)
        }

        if (groupKey) {
            EncryptionUtil.validateGroupKey(groupKey)
        }

        const stream = (streamObjectOrId instanceof Stream) ? streamObjectOrId : await this.getStream(streamObjectOrId)
        const streamPartition = this.computeStreamPartition(stream.partitions, partitionKey)
        const publisherId = await this.getPublisherId()
        const [messageId, prevMsgRef] = this.createMsgIdAndPrevRef(stream.id, streamPartition, timestamp, publisherId)

        const streamMessage = new StreamMessage({
            messageId,
            prevMsgRef,
            content: data,
            contentType: StreamMessage.CONTENT_TYPES.MESSAGE,
        })

        if (groupKey && this.keyStorageUtil.hasKey(stream.id) && groupKey !== this.keyStorageUtil.getLatestKey(stream.id).groupKey) {
            EncryptionUtil.encryptStreamMessageAndNewKey(groupKey, streamMessage, this.keyStorageUtil.getLatestKey(stream.id).groupKey)
            this.keyStorageUtil.addKey(stream.id, groupKey)
        } else if (groupKey || this.keyStorageUtil.hasKey(stream.id)) {
            if (groupKey) {
                this.keyStorageUtil.addKey(stream.id, groupKey)
            }
            EncryptionUtil.encryptStreamMessage(streamMessage, this.keyStorageUtil.getLatestKey(stream.id).groupKey)
        }

        if (this._signer) {
            await this._signer.signStreamMessage(streamMessage)
        }
        return streamMessage
    }

    async createGroupKeyRequest({
        messagePublisherAddress,
        streamId,
        publicKey,
        start,
        end,
    }) {
        if (!this._signer) {
            throw new Error('Cannot create unsigned group key request. Must authenticate with "privateKey" or "provider"')
        }
        const publisherId = await this.getPublisherId()
        const requestId = uuid('GroupKeyRequest')
        const data = {
            streamId,
            requestId,
            publicKey,
        }
        if (start && end) {
            data.range = {
                start,
                end,
            }
        }
        const [messageId, prevMsgRef] = this.createDefaultMsgIdAndPrevRef(getKeyExchangeStreamId(messagePublisherAddress), publisherId)
        const streamMessage = new StreamMessage({
            messageId,
            prevMsgRef,
            contentType: StreamMessage.CONTENT_TYPES.GROUP_KEY_REQUEST,
            content: data,
        })
        await this._signer.signStreamMessage(streamMessage)
        return streamMessage
    }

    async createGroupKeyResponse({ subscriberAddress, streamId, requestId, encryptedGroupKeys }) {
        if (!this._signer) {
            throw new Error('Cannot create unsigned group key response. Must authenticate with "privateKey" or "provider"')
        }
        const publisherId = await this.getPublisherId()
        const data = {
            requestId,
            streamId,
            keys: encryptedGroupKeys,
        }
        const [messageId, prevMsgRef] = this.createDefaultMsgIdAndPrevRef(getKeyExchangeStreamId(subscriberAddress), publisherId)
        const streamMessage = new StreamMessage({
            messageId,
            prevMsgRef,
            contentType: StreamMessage.CONTENT_TYPES.GROUP_KEY_RESPONSE_SIMPLE,
            encryptionType: StreamMessage.ENCRYPTION_TYPES.RSA,
            content: data,
        })
        await this._signer.signStreamMessage(streamMessage)
        return streamMessage
    }

    async createErrorMessage({ destinationAddress, streamId, error, requestId }) {
        if (!this._signer) {
            throw new Error('Cannot create unsigned error message. Must authenticate with "privateKey" or "provider"')
        }
        const publisherId = await this.getPublisherId()
        const data = {
            code: MessageCreationUtil.getErrorCodeFromError(error),
            message: error.message,
            streamId,
            requestId,
        }
        const [messageId, prevMsgRef] = this.createDefaultMsgIdAndPrevRef(destinationAddress.toLowerCase(), publisherId)
        const streamMessage = new StreamMessage({
            messageId,
            prevMsgRef,
            contentType: StreamMessage.CONTENT_TYPES.GROUP_KEY_ERROR_RESPONSE,
            content: data,
        })

        await this._signer.signStreamMessage(streamMessage)
        return streamMessage
    }

    createMsgIdAndPrevRef(streamId, streamPartition, timestamp, publisherId) {
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

    createDefaultMsgIdAndPrevRef(streamId, publisherId) {
        return this.createMsgIdAndPrevRef(streamId, 0, Date.now(), publisherId)
    }

    static getErrorCodeFromError(error) {
        if (error instanceof InvalidGroupKeyRequestError) {
            return 'INVALID_GROUP_KEY_REQUEST'
        }

        if (error instanceof InvalidGroupKeyResponseError) {
            return 'INVALID_GROUP_KEY_RESPONSE'
        }

        if (error instanceof InvalidContentTypeError) {
            return 'INVALID_CONTENT_TYPE'
        }
        return 'UNEXPECTED_ERROR'
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
}

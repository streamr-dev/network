import crypto from 'crypto'
import randomstring from 'randomstring'
import { MessageLayer } from 'streamr-client-protocol'
import { ethers } from 'ethers'

const { StreamMessage } = MessageLayer

export default class MessageCreationUtil {
    constructor(auth, signer, userInfoPromise) {
        this.auth = auth
        this._signer = signer
        this.userInfoPromise = userInfoPromise
        this.publishedStreams = {}
        this.msgChainId = randomstring.generate(20)
        this.cachedHashes = {}
    }

    async getUsername() {
        if (!this.usernamePromise) {
            this.usernamePromise = this.userInfoPromise.then((userInfo) => userInfo.username)
        }
        return this.usernamePromise
    }

    async getPublisherId() {
        if (!this.publisherId) {
            if (this.auth.privateKey !== undefined) {
                this.publisherId = ethers.utils.computeAddress(this.auth.privateKey)
            } else if (this.auth.provider !== undefined) {
                const provider = new ethers.providers.Web3Provider(this.auth.provider)
                this.publisherId = provider.getSigner().address
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
        return [prevTimestamp, prevSequenceNumber]
    }

    getPrevTimestamp(key) {
        return this.publishedStreams[key].prevTimestamp
    }

    getPrevSequenceNumber(key) {
        return this.publishedStreams[key].prevSequenceNumber
    }

    async createStreamMessage(stream, data, timestamp = Date.now(), partitionKey = null) {
        // Validate data
        if (typeof data !== 'object') {
            throw new Error(`Message data must be an object! Was: ${data}`)
        }
        const streamPartition = this.computeStreamPartition(stream.partitions, partitionKey)
        const publisherId = await this.getPublisherId()

        const key = stream.id + streamPartition
        if (!this.publishedStreams[key]) {
            this.publishedStreams[key] = {
                prevTimestamp: null,
                prevSequenceNumber: 0,
            }
        }

        const sequenceNumber = this.getNextSequenceNumber(key, timestamp)
        const streamMessage = StreamMessage.create(
            [stream.id, streamPartition, timestamp, sequenceNumber, publisherId, this.msgChainId], this.getPrevMsgRef(key),
            StreamMessage.CONTENT_TYPES.JSON, data, StreamMessage.SIGNATURE_TYPES.NONE, null,
        )
        this.publishedStreams[key].prevTimestamp = timestamp
        this.publishedStreams[key].prevSequenceNumber = sequenceNumber
        if (this._signer) {
            await this._signer.signStreamMessage(streamMessage)
        }
        return streamMessage
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

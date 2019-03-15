import sha256 from 'js-sha256'
import randomstring from 'randomstring'
import { MessageLayer } from 'streamr-client-protocol'
import FakeProvider from 'web3-fake-provider'

const murmur = require('murmurhash-native').murmurHash
const Web3 = require('web3')

const { StreamMessage } = MessageLayer
const web3 = new Web3(new FakeProvider())

export default class MessageCreationUtil {
    constructor(auth, signer, userInfoPromise) {
        this.auth = auth
        this._signer = signer
        this.userInfoPromise = userInfoPromise
        this.publishedStreams = {}
        this.msgChainId = randomstring.generate(20)
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
                this.publisherId = web3.eth.accounts.privateKeyToAccount(this.auth.privateKey).address
            } else if (this.auth.provider !== undefined) {
                const w3 = new Web3(this.auth.provider)
                const accounts = await w3.eth.getAccounts()
                /* eslint-disable prefer-destructuring */
                this.publisherId = accounts[0]
            } else if (this.auth.apiKey !== undefined) {
                this.publisherId = sha256(await this.getUsername())
            } else if (this.auth.username !== undefined) {
                this.publisherId = sha256(this.auth.username)
            } else if (this.auth.sessionToken !== undefined) {
                this.publisherId = sha256(await this.getUsername())
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
        const streamPartition = MessageCreationUtil.computeStreamPartition(stream.partitions, partitionKey)
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

    static computeStreamPartition(partitionCount, partitionKey) {
        if (!partitionCount) {
            throw new Error('partitionCount is falsey!')
        } else if (partitionCount === 1) {
            // Fast common case
            return 0
        } else if (partitionKey) {
            const bytes = Buffer.from(partitionKey, 'utf8')
            const resultBytes = murmur(bytes, 0, 'buffer')
            const intHash = resultBytes.readInt32LE()
            return Math.abs(intHash) % partitionCount
        } else {
            // Fallback to random partition if no key
            return Math.floor(Math.random() * partitionCount)
        }
    }
}

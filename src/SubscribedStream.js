import Signer from './Signer'

const PUBLISHERS_EXPIRATION_TIME = 30 * 60 * 1000 // 30 minutes
export default class SubscribedStream {
    constructor(client, streamId) {
        this._client = client
        this.streamId = streamId
        this.subscriptions = {}
    }

    getPublishers() {
        if (!this.publishersPromise || (Date.now() - this.lastAccess) > PUBLISHERS_EXPIRATION_TIME) {
            this.publishersPromise = this._client.getStreamPublishers(this.streamId)
            this.lastAccess = Date.now()
        }
        return this.publishersPromise
    }

    async verifyStreamMessage(msg) {
        if (this._client.options.verifySignatures === 'always') {
            if (msg.signatureType && msg.signatureType !== 0 && msg.signature) {
                const publishers = await this.getPublishers()
                return Signer.verifyStreamMessage(msg, new Set(publishers))
            }
            return false
        } else if (this._client.options.verifySignatures === 'never') {
            return true
        }
        // if this._client.options.verifySignatures === 'auto'
        if (msg.signatureType && msg.signatureType !== 0 && msg.signature) { // always verify in case the message is signed
            const publishers = await this.getPublishers()
            return Signer.verifyStreamMessage(msg, new Set(publishers))
        }
        return !(await this.getVerifySignatures())
    }

    async getStream() {
        if (!this.streamPromise) {
            this.streamPromise = this._client.getStream(this.streamId)
        }
        return this.streamPromise
    }

    async getVerifySignatures() {
        if (this.requireSignedData === undefined) {
            const stream = await this.getStream()
            this.requireSignedData = stream.requireSignedData
        }
        return this.requireSignedData
    }

    getSubscription(subId) {
        return this.subscriptions[subId]
    }

    getSubscriptions() {
        return Object.values(this.subscriptions) || []
    }

    isSubscribing() {
        return this.subscribing
    }

    setSubscribing(value) {
        this.subscribing = value
    }

    emptySubscriptionsSet() {
        return Object.keys(this.subscriptions).length === 0
    }

    addSubscription(sub) {
        this.subscriptions[sub.id] = sub
    }

    removeSubscription(sub) {
        delete this.subscriptions[sub.id]
    }
}
SubscribedStream.PUBLISHERS_EXPIRATION_TIME = PUBLISHERS_EXPIRATION_TIME

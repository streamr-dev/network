import Signer from './Signer'

export default class SubscribedStream {
    constructor(client, streamId) {
        this._client = client
        this.streamId = streamId
        this.subscriptions = {}
        if (client.options.verifySignatures === 'always') {
            this.verifySignatures = true
        } else if (client.options.verifySignatures === 'never') {
            this.verifySignatures = false
        } else if (client.options.verifySignatures === 'auto') {
            this.verifySignatures = undefined // Will retrieve it from the stream's metadata in getVerifySignatures() method
        } else {
            throw new Error(`Unrecognized verifySignatures parameter value: ${client.options.verifySignatures}`)
        }
    }

    getPublishers() {
        if (!this.publishersPromise) {
            this.publishersPromise = this._client.getStreamPublishers(this.streamId)
        }
        return this.publishersPromise
    }

    async verifyStreamMessage(msg) {
        if (msg.signatureType && msg.signatureType !== 0) { // always verify in case the message is signed
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
        if (this.verifySignatures === undefined) { // client.options.verifySignatures === 'auto'
            const stream = await this.getStream()
            this.verifySignatures = stream.requireSignedData
        }
        return this.verifySignatures
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

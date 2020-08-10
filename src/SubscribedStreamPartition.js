import { Utils, MessageLayer } from 'streamr-client-protocol'
import memoize from 'promise-memoize'

import SignatureRequiredError from './errors/SignatureRequiredError'

const { StreamMessageValidator } = Utils
const { StreamMessage } = MessageLayer

const memoizeOpts = {
    maxAge: 15 * 60 * 1000,
    maxErrorAge: 60 * 1000,
}

export default class SubscribedStreamPartition {
    constructor(client, streamId, streamPartition) {
        this._client = client
        this.streamId = streamId
        this.streamPartition = streamPartition
        this.subscriptions = {}
        this.getStream = memoize(this.getStream.bind(this), memoizeOpts)
        this.validator = new StreamMessageValidator({
            getStream: this.getStream,
            isPublisher: memoize(async (publisherId, _streamId) => (
                this._client.isStreamPublisher(_streamId, publisherId)
            ), memoizeOpts),
            isSubscriber: memoize(async (ethAddress, _streamId) => (
                this._client.isStreamSubscriber(_streamId, ethAddress)
            ), memoizeOpts),
        })
        this.getPublishers = memoize(this.getPublishers.bind(this), memoizeOpts)
        this.getSubscribers = memoize(this.getSubscribers.bind(this), memoizeOpts)
        this.isValidPublisher = memoize(this.isValidPublisher.bind(this), memoizeOpts)
        this.isValidSubscriber = memoize(this.isValidSubscriber.bind(this), memoizeOpts)
    }

    async getPublishers() {
        const publishers = await this._client.getStreamPublishers(this.streamId)
        return publishers.reduce((obj, key) => (
            Object.assign(obj, {
                [key]: true
            })
        ), {})
    }

    async getSubscribers() {
        const subscribers = await this._client.getStreamSubscribers(this.streamId)
        return subscribers.reduce((obj, key) => (
            Object.assign(obj, {
                [key]: true
            })
        ), {})
    }

    async isValidPublisher(publisherId) {
        return this._client.isStreamPublisher(this.streamId, publisherId)
    }

    async isValidSubscriber(ethAddress) {
        return this._client.isStreamSubscriber(this.streamId, ethAddress)
    }

    async verifyStreamMessage(msg) {
        // Check special cases controlled by the verifySignatures policy
        const { options } = this._client
        if (options.verifySignatures === 'never' && msg.messageType === StreamMessage.MESSAGE_TYPES.MESSAGE) {
            return // no validation required
        }

        if (options.verifySignatures === 'always' && !msg.signature) {
            throw new SignatureRequiredError(msg)
        }

        // In all other cases validate using the validator
        await this.validator.validate(msg) // will throw with appropriate validation failure
    }

    async getStream() {
        return this._client.getStream(this.streamId)
    }

    getSubscription(subscriptionId) {
        return this.subscriptions[subscriptionId]
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
        if (this.subscriptions[sub.id]) {
            this.subscriptions[sub.id].stop()
            delete this.subscriptions[sub.id]
        }
    }
}

SubscribedStreamPartition.memoizeOpts = memoizeOpts

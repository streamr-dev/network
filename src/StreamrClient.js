import EventEmitter from 'eventemitter3'
import debugFactory from 'debug'
import qs from 'qs'
import once from 'once'
import { Wallet } from 'ethers'
import { ControlLayer, MessageLayer, Errors } from 'streamr-client-protocol'
import uniqueId from 'lodash.uniqueid'

import HistoricalSubscription from './HistoricalSubscription'
import Connection from './Connection'
import Session from './Session'
import Signer from './Signer'
import SubscribedStreamPartition from './SubscribedStreamPartition'
import Stream from './rest/domain/Stream'
import FailedToPublishError from './errors/FailedToPublishError'
import MessageCreationUtil from './MessageCreationUtil'
import { waitFor, getVersionString } from './utils'
import RealTimeSubscription from './RealTimeSubscription'
import CombinedSubscription from './CombinedSubscription'
import Subscription from './Subscription'
import EncryptionUtil from './EncryptionUtil'
import KeyExchangeUtil from './KeyExchangeUtil'
import KeyStorageUtil from './KeyStorageUtil'
import ResendUtil from './ResendUtil'
import InvalidContentTypeError from './errors/InvalidContentTypeError'

const {
    SubscribeRequest,
    UnsubscribeRequest,
    ResendLastRequest,
    ResendFromRequest,
    ResendRangeRequest,
    ControlMessage,
} = ControlLayer

const { StreamMessage, MessageRef } = MessageLayer

export default class StreamrClient extends EventEmitter {
    constructor(options, connection) {
        super()
        this.id = uniqueId('StreamrClient')
        this.debug = debugFactory(this.id)
        // Default options
        this.options = {
            debug: this.debug,
            // The server to connect to
            url: 'wss://streamr.network/api/v1/ws',
            restUrl: 'https://streamr.network/api/v1',
            // Automatically connect on first subscribe
            autoConnect: true,
            // Automatically disconnect on last unsubscribe
            autoDisconnect: true,
            orderMessages: true,
            auth: {},
            publishWithSignature: 'auto',
            verifySignatures: 'auto',
            retryResendAfter: 5000,
            gapFillTimeout: 5000,
            maxPublishQueueSize: 10000,
            // encryption options
            publisherStoreKeyHistory: true,
            publisherGroupKeys: {}, // {streamId: groupKey}
            subscriberGroupKeys: {}, // {streamId: {publisherId: groupKey}}
            keyExchange: {},
            streamrNodeAddress: '0xf3E5A65851C3779f468c9EcB32E6f25D9D68601a',
            streamrOperatorAddress: '0xc0aa4dC0763550161a6B59fa430361b5a26df28C',
            tokenAddress: '0x0Cf0Ee63788A0849fE5297F3407f701E122cC023',
        }
        this.subscribedStreamPartitions = {}

        Object.assign(this.options, options || {})

        const parts = this.options.url.split('?')
        if (parts.length === 1) { // there is no query string
            const controlLayer = `controlLayerVersion=${ControlMessage.LATEST_VERSION}`
            const messageLayer = `messageLayerVersion=${StreamMessage.LATEST_VERSION}`
            this.options.url = `${this.options.url}?${controlLayer}&${messageLayer}`
        } else {
            const queryObj = qs.parse(parts[1])
            if (!queryObj.controlLayerVersion) {
                this.options.url = `${this.options.url}&controlLayerVersion=1`
            }

            if (!queryObj.messageLayerVersion) {
                this.options.url = `${this.options.url}&messageLayerVersion=31`
            }
        }

        // always add streamrClient version
        this.options.url = `${this.options.url}&streamrClient=${getVersionString()}`

        // Backwards compatibility for option 'authKey' => 'apiKey'
        if (this.options.authKey && !this.options.apiKey) {
            this.options.apiKey = this.options.authKey
        }

        if (this.options.apiKey) {
            this.options.auth.apiKey = this.options.apiKey
        }

        if (this.options.auth.privateKey && !this.options.auth.privateKey.startsWith('0x')) {
            this.options.auth.privateKey = `0x${this.options.auth.privateKey}`
        }

        if (this.options.keyExchange) {
            this.encryptionUtil = new EncryptionUtil(this.options.keyExchange)
            this.keyExchangeUtil = new KeyExchangeUtil(this)
        }

        // add the start time to every group key if missing
        const validated = KeyStorageUtil.validateAndAddStart(this.options.publisherGroupKeys, this.options.subscriberGroupKeys)
        /* eslint-disable prefer-destructuring */
        this.options.publisherGroupKeys = validated[0]
        this.options.subscriberGroupKeys = validated[1]
        /* eslint-enable prefer-destructuring */

        this.keyStorageUtil = KeyStorageUtil.getKeyStorageUtil(
            this.options.publisherGroupKeys, this.options.publisherStoreKeyHistory
        )

        this.publishQueue = []
        this.session = new Session(this, this.options.auth)
        this.signer = Signer.createSigner({
            ...this.options.auth,
            debug: this.debug,
        }, this.options.publishWithSignature)
        // Event handling on connection object
        this.connection = connection || new Connection(this.options)

        this.getUserInfo = this.getUserInfo.bind(this)

        if (this.session.isUnauthenticated()) {
            this.msgCreationUtil = null
        } else {
            this.msgCreationUtil = new MessageCreationUtil(
                this.options.auth, this.signer, once(() => this.getUserInfo()),
                (streamId) => this.getStream(streamId)
                    .catch((err) => this.emit('error', err)), this.keyStorageUtil,
            )
        }

        this.resendUtil = new ResendUtil()
        this.resendUtil.on('error', (err) => this.emit('error', err))

        this.on('error', (...args) => {
            this.onError(...args)
            this.ensureDisconnected()
        })

        // Broadcast messages to all subs listening on stream-partition
        this.connection.on(ControlMessage.TYPES.BroadcastMessage, (msg) => {
            const stream = this._getSubscribedStreamPartition(msg.streamMessage.getStreamId(), msg.streamMessage.getStreamPartition())
            if (stream) {
                const verifyFn = once(() => stream.verifyStreamMessage(msg.streamMessage)) // ensure verification occurs only once
                // sub.handleBroadcastMessage never rejects: on any error it emits an 'error' event on the Subscription
                stream.getSubscriptions().forEach((sub) => sub.handleBroadcastMessage(msg.streamMessage, verifyFn))
            } else {
                this.debug('WARN: message received for stream with no subscriptions: %s', msg.streamMessage.getStreamId())
            }
        })

        // Unicast messages to a specific subscription only
        this.connection.on(ControlMessage.TYPES.UnicastMessage, async (msg) => {
            const stream = this._getSubscribedStreamPartition(msg.streamMessage.getStreamId(), msg.streamMessage.getStreamPartition())
            if (stream) {
                const sub = this.resendUtil.getSubFromResendResponse(msg)

                if (sub && stream.getSubscription(sub.id)) {
                    // sub.handleResentMessage never rejects: on any error it emits an 'error' event on the Subscription
                    sub.handleResentMessage(
                        msg.streamMessage, msg.requestId,
                        once(() => stream.verifyStreamMessage(msg.streamMessage)), // ensure verification occurs only once
                    )
                } else {
                    this.debug('WARN: request id not found for stream: %s, sub: %s', msg.streamMessage.getStreamId(), msg.requestId)
                }
            } else {
                this.debug('WARN: message received for stream with no subscriptions: %s', msg.streamMessage.getStreamId())
            }
        })

        this.connection.on(ControlMessage.TYPES.SubscribeResponse, (response) => {
            const stream = this._getSubscribedStreamPartition(response.streamId, response.streamPartition)
            if (stream) {
                stream.setSubscribing(false)
                stream.getSubscriptions().filter((sub) => !sub.resending)
                    .forEach((sub) => sub.setState(Subscription.State.subscribed))
            }
            this.debug('Client subscribed: streamId: %s, streamPartition: %s', response.streamId, response.streamPartition)
        })

        this.connection.on(ControlMessage.TYPES.UnsubscribeResponse, (response) => {
            this.debug('Client unsubscribed: streamId: %s, streamPartition: %s', response.streamId, response.streamPartition)
            const stream = this._getSubscribedStreamPartition(response.streamId, response.streamPartition)
            if (stream) {
                stream.getSubscriptions().forEach((sub) => {
                    this._removeSubscription(sub)
                    sub.setState(Subscription.State.unsubscribed)
                })
            }

            this._checkAutoDisconnect()
        })

        // Route resending state messages to corresponding Subscriptions
        this.connection.on(ControlMessage.TYPES.ResendResponseResending, (response) => {
            const stream = this._getSubscribedStreamPartition(response.streamId, response.streamPartition)
            const sub = this.resendUtil.getSubFromResendResponse(response)

            if (stream && sub && stream.getSubscription(sub.id)) {
                stream.getSubscription(sub.id).handleResending(response)
            } else {
                this.debug('resent: Subscription %s is gone already', response.requestId)
            }
        })

        this.connection.on(ControlMessage.TYPES.ResendResponseNoResend, (response) => {
            const stream = this._getSubscribedStreamPartition(response.streamId, response.streamPartition)
            const sub = this.resendUtil.getSubFromResendResponse(response)
            this.resendUtil.deleteDoneSubsByResponse(response)

            if (stream && sub && stream.getSubscription(sub.id)) {
                stream.getSubscription(sub.id).handleNoResend(response)
            } else {
                this.debug('resent: Subscription %s is gone already', response.requestId)
            }
        })

        this.connection.on(ControlMessage.TYPES.ResendResponseResent, (response) => {
            const stream = this._getSubscribedStreamPartition(response.streamId, response.streamPartition)
            const sub = this.resendUtil.getSubFromResendResponse(response)
            this.resendUtil.deleteDoneSubsByResponse(response)

            if (stream && sub && stream.getSubscription(sub.id)) {
                stream.getSubscription(sub.id).handleResent(response)
            } else {
                this.debug('resent: Subscription %s is gone already', response.requestId)
            }
        })

        // On connect/reconnect, send pending subscription requests
        this.connection.on('connected', async () => {
            await new Promise((resolve) => setTimeout(resolve, 0)) // wait a tick to let event handlers finish
            if (!this.isConnected()) { return }
            this.debug('Connected!')
            this.emit('connected')
            try {
                await this._subscribeToKeyExchangeStream()
                if (!this.isConnected()) { return }
                // Check pending subscriptions
                Object.keys(this.subscribedStreamPartitions).forEach((key) => {
                    this.subscribedStreamPartitions[key].getSubscriptions().forEach((sub) => {
                        if (sub.getState() !== Subscription.State.subscribed) {
                            this._resendAndSubscribe(sub).catch((err) => {
                                this.emit('error', err)
                            })
                        }
                    })
                })

                // Check pending publish requests
                const publishQueueCopy = this.publishQueue.slice(0)
                this.publishQueue = []
                publishQueueCopy.forEach((publishFn) => publishFn())
            } catch (err) {
                this.emit('error', err)
            }
        })

        this.connection.on('disconnected', () => {
            this.debug('Disconnected.')
            this.emit('disconnected')

            Object.keys(this.subscribedStreamPartitions)
                .forEach((key) => {
                    const stream = this.subscribedStreamPartitions[key]
                    stream.setSubscribing(false)
                    stream.getSubscriptions().forEach((sub) => {
                        sub.onDisconnected()
                    })
                })
        })

        this.connection.on(ControlMessage.TYPES.ErrorResponse, (err) => {
            const errorObject = new Error(err.errorMessage)
            this.emit('error', errorObject)
        })

        this.connection.on('error', async (err) => {
            // If there is an error parsing a json message in a stream, fire error events on the relevant subs
            if (err instanceof Errors.InvalidJsonError) {
                const stream = this._getSubscribedStreamPartition(err.streamMessage.getStreamId(), err.streamMessage.getStreamPartition())
                if (stream) {
                    stream.getSubscriptions().forEach((sub) => sub.handleError(err))
                } else {
                    this.debug('WARN: InvalidJsonError received for stream with no subscriptions: %s', err.streamId)
                }
            } else {
                // if it looks like an error emit as-is, otherwise wrap in new Error
                const errorObject = (err && err.stack && err.message) ? err : new Error(err)
                this.emit('error', errorObject)
            }
        })
    }

    /**
     * Override to control output
     */

    onError(error) { // eslint-disable-line class-methods-use-this
        console.error(error)
    }

    async _subscribeToKeyExchangeStream() {
        if (!this.options.auth.privateKey && !this.options.auth.provider) {
            return
        }
        await this.session.getSessionToken() // trigger auth errors if any
        // subscribing to own keyexchange stream
        const publisherId = await this.getPublisherId()
        const streamId = KeyExchangeUtil.getKeyExchangeStreamId(publisherId)
        this.subscribe(streamId, async (parsedContent, streamMessage) => {
            if (streamMessage.contentType === StreamMessage.CONTENT_TYPES.GROUP_KEY_REQUEST) {
                if (this.keyExchangeUtil) {
                    try {
                        await this.keyExchangeUtil.handleGroupKeyRequest(streamMessage)
                    } catch (error) {
                        this.debug('WARN: %s', error.message)
                        const msg = streamMessage.getParsedContent()
                        const errorMessage = await this.msgCreationUtil.createErrorMessage({
                            keyExchangeStreamId: streamId,
                            requestId: msg.requestId,
                            streamId: msg.streamId,
                            error,
                        })
                        this.publishStreamMessage(errorMessage)
                    }
                }
            } else if (streamMessage.contentType === StreamMessage.CONTENT_TYPES.GROUP_KEY_RESPONSE_SIMPLE) {
                if (this.keyExchangeUtil) {
                    this.keyExchangeUtil.handleGroupKeyResponse(streamMessage)
                }
            } else if (streamMessage.contentType === StreamMessage.CONTENT_TYPES.GROUP_KEY_ERROR_RESPONSE) {
                this.debug('WARN: Received error of type %s from %s: %s',
                    streamMessage.getParsedContent().code, streamMessage.getPublisherId(), streamMessage.getParsedContent().message)
            } else {
                throw new InvalidContentTypeError(`Cannot handle message with content type: ${streamMessage.contentType}`)
            }
        })
    }

    _getSubscribedStreamPartition(streamId, streamPartition) {
        const key = streamId + streamPartition
        return this.subscribedStreamPartitions[key]
    }

    _getSubscribedStreamPartitionsForStream(streamId) {
        // TODO: pretty crude method, could improve
        return Object.values(this.subscribedStreamPartitions)
            .filter((stream) => stream.streamId === streamId)
    }

    _addSubscribedStreamPartition(subscribedStreamPartition) {
        const key = subscribedStreamPartition.streamId + subscribedStreamPartition.streamPartition
        this.subscribedStreamPartitions[key] = subscribedStreamPartition
    }

    _deleteSubscribedStreamPartition(subscribedStreamPartition) {
        const key = subscribedStreamPartition.streamId + subscribedStreamPartition.streamPartition
        delete this.subscribedStreamPartitions[key]
    }

    _addSubscription(sub) {
        let sp = this._getSubscribedStreamPartition(sub.streamId, sub.streamPartition)
        if (!sp) {
            sp = new SubscribedStreamPartition(this, sub.streamId, sub.streamPartition)
            this._addSubscribedStreamPartition(sp)
        }
        sp.addSubscription(sub)
    }

    _removeSubscription(sub) {
        const sp = this._getSubscribedStreamPartition(sub.streamId, sub.streamPartition)
        if (sp) {
            sp.removeSubscription(sub)
            if (sp.getSubscriptions().length === 0) {
                this._deleteSubscribedStreamPartition(sp)
            }
        }
    }

    getSubscriptions(streamId, streamPartition) {
        let subs = []

        if (streamPartition) {
            const sp = this._getSubscribedStreamPartition(streamId, streamPartition)
            if (sp) {
                subs = sp.getSubscriptions()
            }
        } else {
            const sps = this._getSubscribedStreamPartitionsForStream(streamId)
            sps.forEach((sp) => sp.getSubscriptions().forEach((sub) => subs.push(sub)))
        }

        return subs
    }

    async publish(streamObjectOrId, data, timestamp = new Date(), partitionKey = null, groupKey) {
        if (this.session.isUnauthenticated()) {
            throw new Error('Need to be authenticated to publish.')
        }
        // Validate streamObjectOrId
        let streamId
        if (streamObjectOrId instanceof Stream) {
            streamId = streamObjectOrId.id
        } else if (typeof streamObjectOrId === 'string') {
            streamId = streamObjectOrId
        } else {
            throw new Error(`First argument must be a Stream object or the stream id! Was: ${streamObjectOrId}`)
        }

        const timestampAsNumber = timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp).getTime()
        const [sessionToken, streamMessage] = await Promise.all([
            this.session.getSessionToken(),
            this.msgCreationUtil.createStreamMessage(streamObjectOrId, data, timestampAsNumber, partitionKey, groupKey),
        ])

        if (this.isConnected()) {
            // If connected, emit a publish request
            return this._requestPublish(streamMessage, sessionToken)
        }

        if (this.options.autoConnect) {
            if (this.publishQueue.length >= this.options.maxPublishQueueSize) {
                throw new FailedToPublishError(
                    streamId,
                    data,
                    `publishQueue exceeded maxPublishQueueSize=${this.options.maxPublishQueueSize}`,
                )
            }

            const published = new Promise((resolve, reject) => {
                this.publishQueue.push(async () => {
                    let publishRequest
                    try {
                        publishRequest = await this._requestPublish(streamMessage, sessionToken)
                    } catch (err) {
                        reject(err)
                        this.emit('error', err)
                        return
                    }
                    resolve(publishRequest)
                })
            })
            // be sure to trigger connection *after* queueing publish
            await this.ensureConnected() // await to ensure connection error fails publish
            return published
        }

        throw new FailedToPublishError(
            streamId,
            data,
            'Wait for the "connected" event before calling publish, or set autoConnect to true!',
        )
    }

    async resend(optionsOrStreamId, callback) {
        const options = this._validateParameters(optionsOrStreamId, callback)

        if (!options.stream) {
            throw new Error('resend: Invalid arguments: options.stream is not given')
        }

        if (!options.resend) {
            throw new Error('resend: Invalid arguments: options.resend is not given')
        }

        await this.ensureConnected()

        const sub = new HistoricalSubscription(options.stream, options.partition || 0, callback, options.resend,
            this.options.subscriberGroupKeys[options.stream], this.options.gapFillTimeout, this.options.retryResendAfter,
            this.options.orderMessages, options.onUnableToDecrypt, this.debug)

        // TODO remove _addSubscription after uncoupling Subscription and Resend
        sub.setState(Subscription.State.subscribed)
        this._addSubscription(sub)
        sub.once('initial_resend_done', () => this._removeSubscription(sub))
        await this._requestResend(sub)
        return sub
    }

    // eslint-disable-next-line class-methods-use-this
    _validateParameters(optionsOrStreamId, callback) {
        if (!optionsOrStreamId) {
            throw new Error('subscribe/resend: Invalid arguments: options is required!')
        } else if (!callback) {
            throw new Error('subscribe/resend: Invalid arguments: callback is required!')
        }

        // Backwards compatibility for giving a streamId as first argument
        let options
        if (typeof optionsOrStreamId === 'string') {
            options = {
                stream: optionsOrStreamId,
            }
        } else if (typeof optionsOrStreamId === 'object') {
            options = optionsOrStreamId
        } else {
            throw new Error(`subscribe/resend: options must be an object! Given: ${optionsOrStreamId}`)
        }

        return options
    }

    subscribe(optionsOrStreamId, callback, legacyOptions) {
        const options = this._validateParameters(optionsOrStreamId, callback)

        // Backwards compatibility for giving an options object as third argument
        Object.assign(options, legacyOptions)

        if (!options.stream) {
            throw new Error('subscribe: Invalid arguments: options.stream is not given')
        }

        if (options.groupKeys) {
            const now = Date.now()
            Object.keys(options.groupKeys).forEach((publisherId) => {
                EncryptionUtil.validateGroupKey(options.groupKeys[publisherId])
                if (!this.options.subscriberGroupKeys[options.stream]) {
                    this.options.subscriberGroupKeys[options.stream] = {}
                }
                this.options.subscriberGroupKeys[options.stream][publisherId] = {
                    groupKey: options.groupKeys[publisherId],
                    start: now
                }
            })
        }

        const groupKeys = {}
        if (this.options.subscriberGroupKeys[options.stream]) {
            Object.keys(this.options.subscriberGroupKeys[options.stream]).forEach((publisherId) => {
                groupKeys[publisherId] = this.options.subscriberGroupKeys[options.stream][publisherId].groupKey
            })
        }

        // Create the Subscription object and bind handlers
        let sub
        if (options.resend) {
            sub = new CombinedSubscription(
                options.stream, options.partition || 0, callback, options.resend,
                groupKeys, this.options.gapFillTimeout, this.options.retryResendAfter,
                this.options.orderMessages, options.onUnableToDecrypt, this.debug,
            )
        } else {
            sub = new RealTimeSubscription(options.stream, options.partition || 0, callback,
                groupKeys, this.options.gapFillTimeout, this.options.retryResendAfter,
                this.options.orderMessages, options.onUnableToDecrypt, this.debug)
        }
        sub.on('gap', (from, to, publisherId, msgChainId) => {
            if (!sub.resending) {
                this._requestResend(sub, {
                    from, to, publisherId, msgChainId,
                })
            }
        })
        sub.on('done', () => {
            this.debug('done event for sub %d', sub.id)
            this.unsubscribe(sub)
        })
        sub.on('groupKeyMissing', async (messagePublisherAddress, start, end) => {
            if (this.encryptionUtil) {
                await this.encryptionUtil.onReady()
                const streamMessage = await this.msgCreationUtil.createGroupKeyRequest({
                    messagePublisherAddress,
                    streamId: sub.streamId,
                    publicKey: this.encryptionUtil.getPublicKey(),
                    start,
                    end,
                })
                await this.publishStreamMessage(streamMessage)
            }
        })

        // Add to lookups
        this._addSubscription(sub)

        // If connected, emit a subscribe request
        if (this.isConnected()) {
            this._resendAndSubscribe(sub)
        } else if (this.options.autoConnect) {
            this.ensureConnected()
        }

        return sub
    }

    unsubscribe(sub) {
        if (!sub || !sub.streamId) {
            throw new Error('unsubscribe: please give a Subscription object as an argument!')
        }

        const sp = this._getSubscribedStreamPartition(sub.streamId, sub.streamPartition)

        // If this is the last subscription for this stream-partition, unsubscribe the client too
        if (sp && sp.getSubscriptions().length === 1
            && this.isConnected()
            && sub.getState() === Subscription.State.subscribed) {
            sub.setState(Subscription.State.unsubscribing)
            this._requestUnsubscribe(sub)
        } else if (sub.getState() !== Subscription.State.unsubscribing && sub.getState() !== Subscription.State.unsubscribed) {
            // Else the sub can be cleaned off immediately
            this._removeSubscription(sub)
            sub.setState(Subscription.State.unsubscribed)
            this._checkAutoDisconnect()
        }
    }

    unsubscribeAll(streamId, streamPartition) {
        if (!streamId) {
            throw new Error('unsubscribeAll: a stream id is required!')
        } else if (typeof streamId !== 'string') {
            throw new Error('unsubscribe: stream id must be a string!')
        }

        let streamPartitions = []

        // Unsubscribe all subs for the given stream-partition
        if (streamPartition) {
            const sp = this._getSubscribedStreamPartition(streamId, streamPartition)
            if (sp) {
                streamPartitions = [sp]
            }
        } else {
            streamPartitions = this._getSubscribedStreamPartitionsForStream(streamId)
        }

        streamPartitions.forEach((sp) => {
            sp.getSubscriptions().forEach((sub) => {
                this.unsubscribe(sub)
            })
        })
    }

    isConnected() {
        return this.connection.state === Connection.State.CONNECTED
    }

    isConnecting() {
        return this.connection.state === Connection.State.CONNECTING
    }

    isDisconnecting() {
        return this.connection.state === Connection.State.DISCONNECTING
    }

    isDisconnected() {
        return this.connection.state === Connection.State.DISCONNECTED
    }

    reconnect() {
        return this.connect()
    }

    async connect() {
        try {
            if (this.isConnected()) {
                throw new Error('Already connected!')
            }

            if (this.connection.state === Connection.State.CONNECTING) {
                throw new Error('Already connecting!')
            }

            this.debug('Connecting to %s', this.options.url)
            await this.connection.connect()
        } catch (err) {
            this.emit('error', err)
            throw err
        }
    }

    pause() {
        return this.connection.disconnect()
    }

    disconnect() {
        if (this.msgCreationUtil) {
            this.msgCreationUtil.stop()
        }

        this.subscribedStreamPartitions = {}
        return this.connection.disconnect()
    }

    logout() {
        return this.session.logout()
    }

    getPublisherId() {
        return this.msgCreationUtil.getPublisherId()
    }

    /**
     * Starts new connection if disconnected.
     * Waits for connection if connecting.
     * No-op if already connected.
     */

    async ensureConnected() {
        if (this.isConnected()) { return Promise.resolve() }

        if (!this.isConnecting()) {
            await this.connect()
        }
        return waitFor(this, 'connected')
    }

    /**
     * Starts disconnection if connected.
     * Waits for disconnection if disconnecting.
     * No-op if already disconnected.
     */

    async ensureDisconnected() {
        this.connection.clearReconnectTimeout()
        if (this.msgCreationUtil) {
            this.msgCreationUtil.stop()
        }

        if (this.isDisconnected()) { return }

        if (this.isDisconnecting()) {
            await waitFor(this, 'disconnected')
            return
        }

        await this.disconnect()
    }

    _checkAutoDisconnect() {
        // Disconnect if no longer subscribed to any streams
        if (this.options.autoDisconnect && Object.keys(this.subscribedStreamPartitions).length === 0) {
            this.debug('Disconnecting due to no longer being subscribed to any streams')
            this.disconnect()
        }
    }

    async _resendAndSubscribe(sub) {
        if (sub.getState() === Subscription.State.subscribing || sub.resending) { return }
        sub.setState(Subscription.State.subscribing)
        // Once subscribed, ask for a resend
        sub.once('subscribed', () => {
            if (!sub.hasResendOptions()) { return }

            this._requestResend(sub)
            // once a message is received, gap filling in Subscription.js will check if this satisfies the resend and request
            // another resend if it doesn't. So we can anyway clear this resend request.
            const handler = () => {
                sub.removeListener('initial_resend_done', handler)
                sub.removeListener('message received', handler)
                sub.removeListener('unsubscribed', handler)
                sub.removeListener('error', handler)
            }
            sub.once('initial_resend_done', handler)
            sub.once('message received', handler)
            sub.once('unsubscribed', handler)
            sub.once('error', handler)
        })
        await this._requestSubscribe(sub)
    }

    async _requestSubscribe(sub) {
        const sp = this._getSubscribedStreamPartition(sub.streamId, sub.streamPartition)
        let subscribedSubs = []
        // never reuse subscriptions when incoming subscription needs resends
        // i.e. only reuse realtime subscriptions
        if (!sub.hasResendOptions()) {
            subscribedSubs = sp.getSubscriptions().filter((it) => (
                it.getState() === Subscription.State.subscribed
                // don't resuse subscriptions currently resending
                && !it.isResending()
            ))
        }

        const sessionToken = await this.session.getSessionToken()

        // If this is the first subscription for this stream-partition, send a subscription request to the server
        if (!sp.isSubscribing() && subscribedSubs.length === 0) {
            const request = new SubscribeRequest({
                streamId: sub.streamId,
                streamPartition: sub.streamPartition,
                sessionToken,
                requestId: this.resendUtil.generateRequestId(),
            })
            this.debug('_requestSubscribe: subscribing client: %o', request)
            sp.setSubscribing(true)
            await this.connection.send(request).catch((err) => {
                sub.setState(Subscription.State.unsubscribed)
                this.emit('error', `Failed to send subscribe request: ${err}`)
            })
        } else if (subscribedSubs.length > 0) {
            // If there already is a subscribed subscription for this stream, this new one will just join it immediately
            this.debug('_requestSubscribe: another subscription for same stream: %s, insta-subscribing', sub.streamId)

            setTimeout(() => {
                sub.setState(Subscription.State.subscribed)
            })
        }
    }

    async _requestUnsubscribe(sub) {
        this.debug('Client unsubscribing stream %o partition %o', sub.streamId, sub.streamPartition)
        const unsubscribeRequest = new UnsubscribeRequest({
            streamId: sub.streamId,
            streamPartition: sub.streamPartition,
            requestId: this.resendUtil.generateRequestId(),
        })
        await this.connection.send(unsubscribeRequest).catch((err) => {
            sub.setState(Subscription.State.subscribed)
            this.handleError(`Failed to send unsubscribe request: ${err}`)
        })
    }

    async _requestResend(sub, resendOptions) {
        sub.setResending(true)
        const requestId = this.resendUtil.registerResendRequestForSub(sub)
        const options = resendOptions || sub.getResendOptions()
        const sessionToken = await this.session.getSessionToken()
        // don't bother requesting resend if not connected
        if (!this.isConnected()) { return }
        let request
        if (options.last > 0) {
            request = new ResendLastRequest({
                streamId: sub.streamId,
                streamPartition: sub.streamPartition,
                requestId,
                numberLast: options.last,
                sessionToken,
            })
        } else if (options.from && !options.to) {
            request = new ResendFromRequest({
                streamId: sub.streamId,
                streamPartition: sub.streamPartition,
                requestId,
                fromMsgRef: new MessageRef(options.from.timestamp, options.from.sequenceNumber),
                publisherId: options.publisherId,
                msgChainId: options.msgChainId,
                sessionToken,
            })
        } else if (options.from && options.to) {
            request = new ResendRangeRequest({
                streamId: sub.streamId,
                streamPartition: sub.streamPartition,
                requestId,
                fromMsgRef: new MessageRef(options.from.timestamp, options.from.sequenceNumber),
                toMsgRef: new MessageRef(options.to.timestamp, options.to.sequenceNumber),
                publisherId: options.publisherId,
                msgChainId: options.msgChainId,
                sessionToken,
            })
        }

        if (request) {
            this.debug('_requestResend: %o', request)
            await this.connection.send(request).catch((err) => {
                this.handleError(`Failed to send resend request: ${err}`)
            })
        } else {
            this.handleError("Can't _requestResend without resendOptions")
        }
    }

    async publishStreamMessage(streamMessage) {
        const sessionToken = await this.session.getSessionToken()
        return this._requestPublish(streamMessage, sessionToken)
    }

    _requestPublish(streamMessage, sessionToken) {
        const requestId = this.resendUtil.generateRequestId()
        const request = new ControlLayer.PublishRequest({
            streamMessage,
            requestId,
            sessionToken,
        })
        this.debug('_requestPublish: %o', request)
        return this.connection.send(request)
    }

    // each element of the array "groupKeys" is an object with 2 fields: "groupKey" and "start"
    _setGroupKeys(streamId, publisherId, groupKeys) {
        if (!this.options.subscriberGroupKeys[streamId]) {
            this.options.subscriberGroupKeys[streamId] = {}
        }
        const last = groupKeys[groupKeys.length - 1]
        const current = this.options.subscriberGroupKeys[streamId][publisherId]
        if (!current || last.start > current.start) {
            this.options.subscriberGroupKeys[streamId][publisherId] = last
        }
        // TODO: fix this hack in other PR
        this.subscribedStreamPartitions[streamId + '0'].setSubscriptionsGroupKeys(publisherId, groupKeys.map((obj) => obj.groupKey))
    }

    handleError(msg) {
        this.debug(msg)
        this.emit('error', msg)
    }

    static generateEthereumAccount() {
        const wallet = Wallet.createRandom()
        return {
            address: wallet.address,
            privateKey: wallet.privateKey,
        }
    }
}

import EventEmitter from 'eventemitter3'
import { ControlLayer } from 'streamr-client-protocol'
import Debug from 'debug'

import { counterId, uuid, CacheAsyncFn } from './utils'
import { validateOptions } from './stream/utils'
import Config from './Config'
import StreamrEthereum from './Ethereum'
import Session from './Session'
import Connection from './Connection'
import Publisher from './publish'
import Subscriber from './subscribe'
import { getUserId } from './user'

/**
 * Wrap connection message events with message parsing.
 */

class StreamrConnection extends Connection {
    constructor(...args) {
        super(...args)
        this.on('message', this.onConnectionMessage)
    }

    // eslint-disable-next-line class-methods-use-this
    parse(messageEvent) {
        return ControlLayer.ControlMessage.deserialize(messageEvent.data)
    }

    onConnectionMessage(messageEvent) {
        let controlMessage
        try {
            controlMessage = this.parse(messageEvent)
        } catch (err) {
            this.debug('(%o) << %o', this.getState(), messageEvent && messageEvent.data)
            this.debug('deserialize error', err)
            this.emit('error', err)
            return
        }

        if (!controlMessage) {
            return
        }

        this.debug('(%o) << %o', this.getState(), controlMessage)
        this.emit(controlMessage.type, controlMessage)
    }
}

class StreamrCached {
    constructor(client) {
        this.client = client
        const cacheOptions = client.options.cache
        this.getStream = CacheAsyncFn(client.getStream.bind(client), {
            ...cacheOptions,
            cacheKey([maybeStreamId]) {
                const { streamId } = validateOptions(maybeStreamId)
                return streamId
            }
        })
        this.getUserInfo = CacheAsyncFn(client.getUserInfo.bind(client), cacheOptions)
        this.isStreamPublisher = CacheAsyncFn(client.isStreamPublisher.bind(client), {
            ...cacheOptions,
            cacheKey([maybeStreamId, ethAddress]) {
                const { streamId } = validateOptions(maybeStreamId)
                return `${streamId}|${ethAddress}`
            }
        })

        this.isStreamSubscriber = CacheAsyncFn(client.isStreamSubscriber.bind(client), {
            ...cacheOptions,
            cacheKey([maybeStreamId, ethAddress]) {
                const { streamId } = validateOptions(maybeStreamId)
                return `${streamId}|${ethAddress}`
            }
        })

        this.getUserId = CacheAsyncFn(client.getUserId.bind(client), cacheOptions)
    }

    clearStream(streamId) {
        this.getStream.clear()
        this.isStreamPublisher.clearMatching((s) => s.startsWith(streamId))
        this.isStreamSubscriber.clearMatching((s) => s.startsWith(streamId))
    }

    clearUser() {
        this.getUserInfo.clear()
        this.getUserId.clear()
    }

    clear() {
        this.clearUser()
        this.clearStream()
    }
}

// use process id in node uid
const uid = process.pid != null ? process.pid : `${uuid().slice(-4)}${uuid().slice(0, 4)}`

export default class StreamrClient extends EventEmitter {
    constructor(options = {}, connection) {
        super()
        this.id = counterId(`${this.constructor.name}:${uid}`)
        this.debug = Debug(this.id)
        this.options = Config({
            id: this.id,
            debug: this.debug,
            ...options,
        })

        this.debug('new StreamrClient %s: %o', this.id, {
            version: process.env.version,
            GIT_VERSION: process.env.GIT_VERSION,
            GIT_COMMITHASH: process.env.GIT_COMMITHASH,
            GIT_BRANCH: process.env.GIT_BRANCH,
        })

        // bind event handlers
        this.getUserInfo = this.getUserInfo.bind(this)
        this.onConnectionConnected = this.onConnectionConnected.bind(this)
        this.onConnectionDisconnected = this.onConnectionDisconnected.bind(this)
        this._onError = this._onError.bind(this)
        this.onConnectionError = this.onConnectionError.bind(this)
        this.getErrorEmitter = this.getErrorEmitter.bind(this)

        this.on('error', this._onError) // attach before creating sub-components incase they fire error events

        this.session = new Session(this, this.options.auth)
        this.connection = connection || new StreamrConnection(this.options)

        this.connection
            .on('connected', this.onConnectionConnected)
            .on('disconnected', this.onConnectionDisconnected)
            .on('error', this.onConnectionError)

        this.publisher = new Publisher(this)
        this.subscriber = new Subscriber(this)
        this.cached = new StreamrCached(this)
        this.ethereum = new StreamrEthereum(this)
    }

    async onConnectionConnected() {
        this.debug('Connected!')
        this.emit('connected')
    }

    async onConnectionDisconnected() {
        this.debug('Disconnected.')
        this.emit('disconnected')
    }

    onConnectionError(err) {
        this.emit('error', new Connection.ConnectionError(err))
    }

    getErrorEmitter(source) {
        return (err) => {
            if (!(err instanceof Connection.ConnectionError || err.reason instanceof Connection.ConnectionError)) {
                // emit non-connection errors
                this.emit('error', err)
            } else {
                source.debug(err)
            }
        }
    }

    _onError(err, ...args) {
        this.onError(err, ...args)
    }

    async send(request) {
        return this.connection.send(request)
    }

    /**
     * Override to control output
     */

    onError(error) { // eslint-disable-line class-methods-use-this
        console.error(error)
    }

    isConnected() {
        return this.connection.isConnected()
    }

    isConnecting() {
        return this.connection.isConnecting()
    }

    isDisconnecting() {
        return this.connection.isDisconnecting()
    }

    isDisconnected() {
        return this.connection.isDisconnected()
    }

    async connect() {
        return this.connection.connect()
    }

    async nextConnection() {
        return this.connection.nextConnection()
    }

    disconnect() {
        this.publisher.stop()
        return Promise.all([
            this.subscriber.subscriptions.removeAll(),
            this.connection.disconnect()
        ])
    }

    getSubscriptions(...args) {
        return this.subscriber.getAll(...args)
    }

    getSubscription(...args) {
        return this.subscriber.get(...args)
    }

    async ensureConnected() {
        return this.connect()
    }

    async ensureDisconnected() {
        return this.disconnect()
    }

    logout() {
        return this.session.logout()
    }

    async publish(...args) {
        return this.publisher.publish(...args)
    }

    async getUserId() {
        return getUserId(this)
    }

    setNextGroupKey(...args) {
        return this.publisher.setNextGroupKey(...args)
    }

    rotateGroupKey(...args) {
        return this.publisher.rotateGroupKey(...args)
    }

    async subscribe(opts, onMessage) {
        let subTask
        let sub
        const hasResend = !!(opts.resend || opts.from || opts.to || opts.last)
        const onEnd = () => {
            if (sub && typeof onMessage === 'function') {
                sub.off('message', onMessage)
            }
        }

        if (hasResend) {
            subTask = this.subscriber.resendSubscribe(opts, onEnd)
        } else {
            subTask = this.subscriber.subscribe(opts, onEnd)
        }

        if (typeof onMessage === 'function') {
            Promise.resolve(subTask).then(async (s) => {
                sub = s
                sub.on('message', onMessage)
                for await (const msg of sub) {
                    sub.emit('message', msg.getParsedContent(), msg)
                }
                return sub
            }).catch((err) => {
                this.emit('error', err)
            })
        }
        return subTask
    }

    async unsubscribe(opts) {
        await this.subscriber.unsubscribe(opts)
    }

    async resend(opts, onMessage) {
        const task = this.subscriber.resend(opts)
        if (typeof onMessage !== 'function') {
            return task
        }

        Promise.resolve(task).then(async (sub) => {
            for await (const msg of sub) {
                await onMessage(msg.getParsedContent(), msg)
            }

            return sub
        }).catch((err) => {
            this.emit('error', err)
        })

        return task
    }

    enableAutoConnect(...args) {
        return this.connection.enableAutoConnect(...args)
    }

    enableAutoDisconnect(...args) {
        return this.connection.enableAutoDisconnect(...args)
    }

    getAddress() {
        return this.ethereum.getAddress()
    }

    static generateEthereumAccount() {
        return StreamrEthereum.generateEthereumAccount()
    }
}

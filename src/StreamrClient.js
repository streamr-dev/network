import EventEmitter from 'eventemitter3'
import debugFactory from 'debug'
import qs from 'qs'
import { Wallet } from 'ethers'
import { ControlLayer, MessageLayer, Errors } from 'streamr-client-protocol'
import uniqueId from 'lodash.uniqueid'

import Connection from './Connection'
import Session from './Session'
import { waitFor, getVersionString } from './utils'
import Publisher from './Publisher'
import Resender from './Resender'
import Subscriber from './Subscriber'

const { ControlMessage } = ControlLayer

const { StreamMessage } = MessageLayer

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
            streamrNodeAddress: '0xf3E5A65851C3779f468c9EcB32E6f25D9D68601a',
            streamrOperatorAddress: '0xc0aa4dC0763550161a6B59fa430361b5a26df28C',
            tokenAddress: '0x0Cf0Ee63788A0849fE5297F3407f701E122cC023',
        }

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

        this.session = new Session(this, this.options.auth)
        // Event handling on connection object
        this.connection = connection || new Connection(this.options)

        this.getUserInfo = this.getUserInfo.bind(this)

        this.on('error', (...args) => {
            this.onError(...args)
            this.ensureDisconnected()
        })

        // On connect/reconnect, send pending subscription requests
        this.connection.on('connected', async () => {
            await new Promise((resolve) => setTimeout(resolve, 0)) // wait a tick to let event handlers finish
            if (!this.isConnected()) { return }
            this.debug('Connected!')
            this.emit('connected')
        })

        this.connection.on('disconnected', () => {
            this.debug('Disconnected.')
            this.emit('disconnected')
        })

        this.connection.on(ControlMessage.TYPES.ErrorResponse, (err) => {
            const errorObject = new Error(err.errorMessage)
            this.emit('error', errorObject)
        })

        this.connection.on('error', async (err) => {
            // If there is an error parsing a json message in a stream, fire error events on the relevant subs
            if ((err instanceof Errors.InvalidJsonError)) {
                this.subscriber.onErrorMessage(err)
            } else {
                // if it looks like an error emit as-is, otherwise wrap in new Error
                const errorObject = (err && err.stack && err.message) ? err : new Error(err)
                this.emit('error', errorObject)
            }
        })

        this.publisher = new Publisher(this)
        this.subscriber = new Subscriber(this)
        this.resender = new Resender(this)
    }

    /**
     * Override to control output
     */

    onError(error) { // eslint-disable-line class-methods-use-this
        console.error(error)
    }

    async resend(...args) {
        return this.resender.resend(...args)
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
        this.publisher.stop()
        this.subscriber.stop()
        return this.connection.disconnect()
    }

    logout() {
        return this.session.logout()
    }

    async publish(...args) {
        return this.publisher.publish(...args)
    }

    getPublisherId() {
        return this.publisher.getPublisherId()
    }

    subscribe(...args) {
        return this.subscriber.subscribe(...args)
    }

    unsubscribe(...args) {
        return this.subscriber.unsubscribe(...args)
    }

    unsubscribeAll(...args) {
        return this.subscriber.unsubscribeAll(...args)
    }

    getSubscriptions(...args) {
        return this.subscriber.getSubscriptions(...args)
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
        this.publisher.stop()
        if (this.isDisconnected()) { return }

        if (this.isDisconnecting()) {
            await waitFor(this, 'disconnected')
            return
        }

        await this.disconnect()
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

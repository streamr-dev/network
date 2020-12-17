import { inspect } from 'util'

import EventEmitter from 'eventemitter3'
import Debug from 'debug'
import WebSocket from 'ws'

import { Scaffold, counterId, pLimitFn, pOne } from './utils'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// add global support for pretty millisecond formatting with %n
Debug.formatters.n = (v) => Debug.humanize(v)

class ConnectionError extends Error {
    constructor(err, ...args) {
        if (err instanceof ConnectionError) {
            return err
        }

        if (err && err.stack) {
            const { message, stack } = err
            super(message, ...args)
            Object.assign(this, err)
            this.stack = stack
            this.reason = err
        } else {
            super(err, ...args)
            if (Error.captureStackTrace) {
                Error.captureStackTrace(this, this.constructor)
            }
        }
    }
}

const openSockets = new Set()
const FORCE_CLOSED = Symbol('FORCE_CLOSED')

async function OpenWebSocket(url, opts, ...args) {
    return new Promise((resolve, reject) => {
        try {
            if (!url) {
                const err = new ConnectionError('URL is not defined!')
                reject(err)
                throw err
            }

            const socket = process.browser ? new WebSocket(url) : new WebSocket(url, opts, ...args)
            let error
            Object.assign(socket, {
                id: counterId('ws'),
                binaryType: 'arraybuffer',
                onopen() {
                    openSockets.add(socket)
                    resolve(socket)
                },
                onclose() {
                    openSockets.delete(socket)
                    reject(new ConnectionError(error || 'socket closed'))
                },
                onerror(event) {
                    error = new ConnectionError(event.error || event)
                },
            })

            // attach debug
            if (opts && opts.debug) {
                socket.debug = opts.debug.extend(socket.id)
                socket.debug.color = opts.debug.color // use existing colour
            } else {
                socket.debug = Debug('StreamrClient::ws').extend(socket.id)
            }
        } catch (err) {
            reject(err)
        }
    })
}

async function CloseWebSocket(socket) {
    return new Promise((resolve, reject) => {
        if (!socket || socket.readyState === WebSocket.CLOSED) {
            resolve()
            return
        }

        const waitThenClose = () => (
            resolve(CloseWebSocket(socket))
        )

        if (socket.readyState === WebSocket.OPENING) {
            socket.addEventListener('error', waitThenClose)
            socket.addEventListener('open', waitThenClose)
        }

        if (socket.readyState === WebSocket.OPEN) {
            socket.addEventListener('close', resolve)
            try {
                socket.close()
            } catch (err) {
                reject(err)
                return
            }
        }

        if (socket.readyState === WebSocket.CLOSING) {
            socket.addEventListener('close', resolve)
        }
    })
}

const STATE = {
    AUTO: 'AUTO',
    CONNECTED: 'CONNECTED',
    DISCONNECTED: 'DISCONNECTED',
}

/* eslint-disable no-underscore-dangle, no-param-reassign */
function SocketConnector(connection) {
    let next
    let socket
    let startedConnecting = false
    let didCloseUnexpectedly = false

    const onClose = () => {
        didCloseUnexpectedly = true
        if (!next.pendingCount && !next.activeCount) {
            // if no pending actions run next & emit any errors
            next().catch((err) => {
                connection.emit('error', err)
            })
        }
    }

    const isValid = () => connection.hasRetries() && connection.isConnectionValid()

    // Connection should go up if connection valid and didn't close unexpectedly
    const shouldConnectCheck = async () => {
        const valid = isValid()
        if (
            // socket goes into disconnecting state before close event fires
            // we can detect that here
            !didCloseUnexpectedly
            && connection.isDisconnecting()
            && valid
            && startedConnecting
        ) {
            didCloseUnexpectedly = true
            startedConnecting = false
        }

        return !didCloseUnexpectedly && valid
    }

    next = Scaffold([
        // handle retry
        async () => {
            if (connection.retryCount > 0) {
                // backoff delay if retrying
                await connection.backoffWait()
            }
            return () => {
                // increase retries on connection end
                connection.retryCount += 1
                if (connection.hasRetries()) {
                    // throw away error if going to retry (otherwise will throw)
                    next.clearError()
                }
                didCloseUnexpectedly = false
            }
        },
        // connecting events
        () => {
            connection.emitTransition('connecting')
            return async () => {
                connection.emitTransition('disconnected')
            }
        },
        // reconnecting events
        () => {
            if (connection.retryCount > 0) {
                connection.emitTransition('reconnecting', connection.retryCount)
            }
        },
        // connect
        async () => {
            startedConnecting = true
            socket = await OpenWebSocket(connection.options.url, {
                perMessageDeflate: false,
                debug: connection._debug,
            })
            socket.addEventListener('close', onClose)
            socket.addEventListener('close', () => {
                // if forced closed by Connection.closeOpen, disable reconnect
                if (socket[FORCE_CLOSED]) {
                    connection._setShouldDisconnect()
                }
            })
            return async () => { // disconnect
                startedConnecting = false
                // remove close listener before closing
                socket.removeEventListener('close', onClose)
                await CloseWebSocket(socket)
            }
        },
        // set socket
        () => {
            connection.socket = socket

            return () => {
                connection.socket = undefined
            }
        },
        // attach message handler
        () => {
            const onMessage = (messageEvent, ...args) => {
                connection.emit('message', messageEvent, ...args)
            }
            socket.addEventListener('message', onMessage)
            return async () => {
                socket.removeEventListener('message', onMessage)
            }
        },
        () => {
            return async () => {
                // don't wait if socket already closed
                if (connection.isDisconnected()) { return }
                const { disconnectDelay = 250 } = connection.options
                await wait(disconnectDelay || 0) // wait a moment before closing
            }
        }
    ], shouldConnectCheck, {
        onChange: async (isConnecting) => {
            // emit disconnecting as soon as we start going down
            if (!isConnecting) {
                connection.emit('disconnecting')
            }
        },
        onDone: async (isConnected, err) => {
            // maybe try again
            if (didCloseUnexpectedly && isValid()) {
                didCloseUnexpectedly = false
                await next.next()
                return
            }

            didCloseUnexpectedly = false

            if (isConnected) {
                connection.retryCount = 0 // eslint-disable-line no-param-reassign
            }

            next.clearError()

            try {
                // emit connected or done depending on whether we're up or down
                connection.emitTransition(isConnected ? 'connected' : 'done', err)
            } finally {
                // firing event above might have changed status
                if (isValid() && isConnected && !connection.isConnected()) {
                    didCloseUnexpectedly = true
                }

                next.clearError()
                await next.next()
            }
        },
    })

    return next
}
/* eslint-enable no-underscore-dangle, no-param-reassign */

const DEFAULT_MAX_RETRIES = 10

/**
 * Wraps WebSocket open/close with promise methods
 * adds events
 * handles simultaneous calls to open/close
 * waits for pending close/open before continuing
 */

export default class Connection extends EventEmitter {
    static getOpen() {
        return openSockets.size
    }

    static async closeOpen() {
        return Promise.all([...openSockets].map(async (socket) => {
            socket[FORCE_CLOSED] = true // eslint-disable-line no-param-reassign
            return CloseWebSocket(socket).catch((err) => {
                socket.debug(err) // ignore error
            })
        }))
    }

    constructor(options = {}) {
        super()
        const id = counterId(this.constructor.name)
        /* istanbul ignore next */
        if (options.debug) {
            this._debug = options.debug.extend(id)
        } else {
            this._debug = Debug(`StreamrClient::${id}`)
        }

        this.options = options
        this.options.autoConnect = !!this.options.autoConnect
        this.options.autoDisconnect = !!this.options.autoDisconnect
        this.isConnectionValid = this.isConnectionValid.bind(this)

        this.retryCount = 0
        this.wantsState = STATE.AUTO // target state or auto
        this.connectionHandles = new Set() // autoConnect when this is not empty, autoDisconnect when empty
        this.backoffWait = pLimitFn(this.backoffWait.bind(this))
        this.step = SocketConnector(this)
        this.debug = this.debug.bind(this)
        this.maybeConnect = pOne(this.maybeConnect.bind(this))
        this.nextConnection = pOne(this.nextConnection.bind(this))
        this.nextDisconnection = pOne(this.nextDisconnection.bind(this))
    }

    debug(...args) {
        if (this.socket) {
            return this.socket.debug(...args)
        }
        return this._debug(...args)
    }

    emit(event, ...args) {
        if (event === 'error') {
            let [err] = args
            const [, ...rest] = args
            err = new ConnectionError(err)
            this.debug('emit', event, ...args)
            return super.emit(event, err, ...rest)
        }

        if (event !== 'message' && typeof event !== 'number' && !(event.startsWith && event.startsWith('_'))) {
            // don't log for messages or events starting with _
            this.debug('emit', event, ...args)
        }

        // note if event handler is async and it rejects we're kinda hosed
        // until node lands unhandledrejection support
        // in eventemitter
        let result
        try {
            result = super.emit(event, ...args)
        } catch (err) {
            super.emit('error', err)
            return true
        }
        return result
    }

    emitTransition(event, ...args) {
        const prevWantsState = this.wantsState
        if (prevWantsState === STATE.AUTO) {
            return this.emit(event, ...args)
        }

        const result = this.emit(event, ...args)
        if (this.wantsState === STATE.AUTO) {
            return result
        }

        // if event emitter changed wantsState state, throw
        if (prevWantsState !== this.wantsState) {
            this.debug('transitioned in event handler %s: wantsState %s -> %s', event, prevWantsState, this.wantsState)
            if (this.wantsState === STATE.CONNECTED) {
                throw new ConnectionError(`connect called in ${event} handler`)
            }

            if (this.wantsState === STATE.DISCONNECTED) {
                throw new ConnectionError(`disconnect called in ${event} handler`)
            }
        }

        return result
    }

    /**
     * Connection
     */

    async connect() {
        this.debug('connect()')
        this.wantsState = STATE.CONNECTED
        this.enableAutoConnect(false)
        this.enableAutoDisconnect(false)
        this.retryCount = 0
        await this.step()
        if (!this.isConnectionValid()) {
            const err = new ConnectionError('disconnected before connected')
            if (this.isWaiting) {
                this.emit('_error', err)
            }
            throw err
        }
    }

    enableAutoDisconnect(autoDisconnect = true) {
        let delay
        if (typeof autoDisconnect === 'number') {
            delay = autoDisconnect
            autoDisconnect = true // eslint-disable-line no-param-reassign
        }
        autoDisconnect = !!autoDisconnect // eslint-disable-line no-param-reassign
        this.options.autoDisconnect = autoDisconnect

        if (autoDisconnect) {
            this.wantsState = STATE.AUTO
        }

        if (delay != null) {
            this.options.disconnectDelay = delay
        }
    }

    enableAutoConnect(autoConnect = true) {
        autoConnect = !!autoConnect // eslint-disable-line no-param-reassign
        if (this.options.autoConnect && !autoConnect) {
            this.didDisableAutoConnect = true
        }

        this.options.autoConnect = autoConnect
        if (autoConnect) {
            this.wantsState = STATE.AUTO
            this.didDisableAutoConnect = false
        }
    }

    async nextConnection() {
        if (this.isConnected()) {
            return Promise.resolve()
        }

        this.isWaiting = true
        return new Promise((resolve, reject) => {
            let onError
            let onDone
            const onConnected = () => {
                this.off('done', onDone)
                this.off('error', onError)
                this.off('_error', onError)
                resolve()
            }
            onDone = (err) => {
                this.off('error', onError)
                this.off('_error', onError)
                this.off('connected', onConnected)
                if (err) {
                    reject(err)
                } else {
                    resolve()
                }
            }
            onError = (err) => {
                this.off('done', onDone)
                this.off('connected', onConnected)
                reject(err)
            }
            this.once('connected', onConnected)
            this.once('done', onDone)
            this.once('error', onError)
            this.once('_error', onError)
        }).finally(() => {
            this.isWaiting = false
        })
    }

    couldConnect() {
        switch (this.wantsState) {
            case STATE.DISCONNECTED: {
                return false
            }
            case STATE.CONNECTED: {
                return true
            }
            case STATE.AUTO: {
                return !!this.options.autoConnect
            }
            default: {
                throw new Error(`unknown state wanted: ${this.wantsState}`)
            }
        }
    }

    isConnectionValid() {
        switch (this.wantsState) {
            case STATE.DISCONNECTED: {
                return false
            }
            case STATE.CONNECTED: {
                return true
            }
            case STATE.AUTO: {
                if (this.options.autoConnect) {
                    return !!(this.connectionHandles.size) && !this._couldAutoDisconnect()
                }
                return false
            }
            default: {
                throw new Error(`unknown state wanted: ${this.wantsState}`)
            }
        }
    }

    hasRetries() {
        const { maxRetries = DEFAULT_MAX_RETRIES } = this.options
        return this.retryCount < maxRetries
    }

    async maybeConnect() {
        await this.step()
    }

    async needsConnection(msg) {
        await this.maybeConnect()
        if (!this.isConnected()) {
            const { autoConnect, autoDisconnect } = this.options
            let autoConnectMsg = `autoConnect: ${!!autoConnect} & autoDisconnect: ${!!autoDisconnect} with ${this.connectionHandles.size} handles.`
            if (!autoConnect && this.didDisableAutoConnect) {
                autoConnectMsg += '\nautoConnect disabled automatically after explicit call to connect/disconnect().'
            }
            // note we can't just let socket.send fail,
            // have to do this check ourselves because the error appears
            // to be uncatchable in the browser
            throw new ConnectionError([
                `Needs connection but – connection: ${this.getState()} & wants: ${this.wantsState}`,
                autoConnectMsg,
                typeof msg === 'function' ? msg() : msg
            ].join('\n'))
        }
    }

    /**
     * Disconnection
     */

    _setShouldDisconnect() {
        this.didDisableAutoConnect = !!this.options.autoConnect
        this.options.autoConnect = false // reset auto-connect on manual disconnect
        this.options.autoDisconnect = false // reset auto-disconnect on manual disconnect
        this.wantsState = STATE.DISCONNECTED
    }

    async disconnect() {
        this.debug('disconnect()')
        this._setShouldDisconnect()

        await this.step()
        if (this.isConnectionValid()) {
            throw new ConnectionError('connected before disconnected')
        }
    }

    async nextDisconnection() {
        if (this.isDisconnected()) {
            return Promise.resolve()
        }

        return new Promise((resolve, reject) => {
            let onError
            const onDisconnected = () => {
                this.off('error', onError)
                resolve()
            }
            onError = (err) => {
                this.off('disconnected', onDisconnected)
                reject(err)
            }
            this.once('disconnected', onDisconnected)
            this.once('error', onError)
        })
    }

    async backoffWait() {
        const { retryBackoffFactor = 1.2, maxRetryWait = 10000 } = this.options
        return new Promise((resolve) => {
            clearTimeout(this._backoffTimeout)
            const timeout = Math.min(
                maxRetryWait, // max wait time
                Math.round((this.retryCount * 10) ** retryBackoffFactor)
            ) || 0
            const { debug } = this
            debug('waiting %n', timeout)
            this._backoffTimeout = setTimeout(() => {
                debug('waited %n', timeout)
                resolve()
            }, timeout)
        })
    }

    /**
     * Auto Connect/Disconnect counters.
     */

    async addHandle(id) {
        if (
            this.connectionHandles.has(id)
            && this.isConnected()
            && this.isConnectionValid()
        ) {
            return // shortcut if already connected with this handle
        }

        this.connectionHandles.add(id)
        await this.maybeConnect()
    }

    /**
     * When no more handles and autoDisconnect is true, disconnect.
     */

    async removeHandle(id) {
        const hadConnection = this.connectionHandles.has(id)
        this.connectionHandles.delete(id)
        if (hadConnection && this._couldAutoDisconnect()) {
            await this.step()
        }
    }

    _couldAutoDisconnect(minSize = 0) {
        return !!(
            this.options.autoDisconnect
            && this.wantsState !== STATE.CONNECTED
            && this.connectionHandles.size === minSize
            && (this.socket ? this.socket.bufferedAmount === 0 : true)
        )
    }

    async send(msg) {
        this.sendID = this.sendID + 1 || 1
        const handle = `send${this.sendID}`
        this.debug('(%s) send()', this.getState())
        await this.addHandle(handle)
        try {
            if (!this.isConnected() || !this.isConnectionValid()) {
                // shortcut await if connected
                await this.needsConnection(() => {
                    const data = typeof msg.serialize === 'function' ? msg.serialize() : msg
                    return `sending ${inspect(data)}...`
                })
            }
            return await this._send(msg)
        } finally {
            await this.removeHandle(handle)
        }
    }

    async _send(msg) {
        return new Promise((resolve, reject) => {
            this.debug('(%s) >> %o', this.getState(), msg)
            // promisify send
            const data = typeof msg.serialize === 'function' ? msg.serialize() : msg
            // send callback doesn't exist with browser websockets, just resolve
            /* istanbul ignore next */
            this.emit('_send', msg) // for informational purposes
            if (process.browser) {
                this.socket.send(data)
                resolve(data)
            } else {
                this.socket.send(data, (err) => {
                    /* istanbul ignore next */
                    if (err) {
                        reject(new ConnectionError(err))
                        return
                    }
                    resolve(data)
                })
            }
        })
    }

    /**
     * Status flags
     */

    getState() {
        if (this.isConnected()) {
            return 'connected'
        }

        if (this.isConnecting()) {
            // this check must go before isDisconnected
            return 'connecting'
        }

        if (this.isDisconnected()) {
            return 'disconnected'
        }

        if (this.isDisconnecting()) {
            return 'disconnecting'
        }

        return 'unknown'
    }

    isReconnecting() {
        return this._isReconnecting
    }

    isConnected() {
        if (!this.socket) {
            return false
        }

        return this.socket.readyState === WebSocket.OPEN
    }

    isDisconnected() {
        if (!this.socket) {
            return true
        }

        return this.socket.readyState === WebSocket.CLOSED
    }

    isDisconnecting() {
        if (!this.socket) {
            return false
        }
        return this.socket.readyState === WebSocket.CLOSING
    }

    isConnecting() {
        if (!this.socket) {
            return false
        }
        return this.socket.readyState === WebSocket.CONNECTING
    }

    onTransition({
        onConnected = () => {},
        onConnecting = () => {},
        onDisconnecting = () => {},
        onDisconnected = () => {},
        onDone = () => {},
        onError,
    }) {
        let onDoneHandler
        const cleanUp = async () => {
            this
                .off('connecting', onConnecting)
                .off('connected', onConnected)
                .off('disconnecting', onDisconnecting)
                .off('disconnected', onDisconnected)
                .off('done', onDoneHandler)
            if (onError) {
                this.off('error', onError)
            }
        }

        onDoneHandler = async (...args) => {
            cleanUp(...args)
            return onDone(...args)
        }

        this
            .on('connecting', onConnecting)
            .on('connected', onConnected)
            .on('disconnecting', onDisconnecting)
            .on('disconnected', onDisconnected)
            .on('done', onDoneHandler)

        if (onError) {
            this.on('error', onError)
        }

        return cleanUp
    }
}

Connection.ConnectionError = ConnectionError

import EventEmitter from 'eventemitter3'
import Debug from 'debug'
import uniqueId from 'lodash.uniqueid'
import WebSocket from 'ws'

import { pUpDownSteps } from './utils'

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

let openSockets = 0

async function OpenWebSocket(url, ...args) {
    return new Promise((resolve, reject) => {
        try {
            if (!url) {
                const err = new ConnectionError('URL is not defined!')
                reject(err)
                throw err
            }
            const socket = process.browser ? new WebSocket(url) : new WebSocket(url, ...args)
            socket.id = uniqueId('socket')
            socket.binaryType = 'arraybuffer'
            let opened = 0
            socket.onopen = () => {
                opened = 1
                openSockets += opened
                resolve(socket)
            }
            let error
            socket.onclose = () => {
                openSockets -= opened
                reject(new ConnectionError(error || 'socket closed'))
            }
            socket.onerror = (event) => {
                error = new ConnectionError(event.error || event)
            }
            return
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

function SocketConnector(connection) {
    let socket
    let didClose = false
    let next
    const onClose = () => {
        didClose = true
        if (!next.pendingCount && !next.activeCount) {
            next().catch((err) => {
                connection.emit('error', err)
            })
        }
    }

    let started = false

    const isValid = () => connection.hasRetries() && connection.isConnectionValid()
    next = pUpDownSteps([
        async () => {
            if (connection.retryCount > 0) {
                await connection.backoffWait()
            }
            return () => {
                connection.retryCount += 1 // eslint-disable-line no-param-reassign
                if (connection.hasRetries()) {
                    next.clearError()
                }
                didClose = false
            }
        },
        () => {
            connection.emitTransition('connecting')
            return async () => {
                connection.emitTransition('disconnected')
            }
        },
        async () => {
            started = true
            socket = await OpenWebSocket(connection.options.url, {
                perMessageDeflate: false,
            })
            socket.addEventListener('close', onClose)
            return async () => {
                started = false
                socket.removeEventListener('close', onClose)
                await CloseWebSocket(socket)
            }
        },
        () => {
            connection.socket = socket // eslint-disable-line no-param-reassign
            if (!connection.isConnected()) {
                didClose = true
            }
            return () => {
                connection.socket = undefined // eslint-disable-line no-param-reassign
            }
        },
        () => {
            const onMessage = (messageEvent, ...args) => {
                connection.emit('message', messageEvent, ...args)
            }
            socket.addEventListener('message', onMessage)
            return () => {
                socket.removeEventListener('message', onMessage)
            }
        }
    ], async () => {
        if (started && !didClose && connection.isDisconnecting() && isValid()) {
            didClose = true
            started = false
        }
        return !didClose && isValid()
    }, {
        onChange: async (isConnecting) => {
            if (!isConnecting) {
                connection.emit('disconnecting')
            }
        },
        onDone: async (isConnected, err) => {
            if (didClose && isValid()) {
                didClose = false
                await next.next()
                return
            }

            didClose = false

            next.clearError()
            try {
                connection.emitTransition(isConnected ? 'connected' : 'done', err)
            } finally {
                if (isValid() && isConnected && !connection.isConnected()) {
                    didClose = true
                }
                next.clearError()
                await next.next()
            }
        },
    })
    return next
}

const DEFAULT_MAX_RETRIES = 10

/**
 * Wraps WebSocket open/close with promise methods
 * adds events
 * handles simultaneous calls to open/close
 * waits for pending close/open before continuing
 */

const STATE = {
    AUTO: 'AUTO',
    CONNECTED: 'CONNECTED',
    DISCONNECTED: 'DISCONNECTED',
}

export default class Connection extends EventEmitter {
    static getOpen() {
        return openSockets
    }

    constructor(options) {
        super()
        this.options = options
        this.options.autoConnect = !!this.options.autoConnect
        this.options.autoDisconnect = !!this.options.autoDisconnect
        this.wantsState = STATE.AUTO
        this.retryCount = 0
        const id = uniqueId('Connection')
        /* istanbul ignore next */
        if (options.debug) {
            this._debug = options.debug.extend(id)
        } else {
            this._debug = Debug(`StreamrClient::${id}`)
        }
        this.debug = this._debug
        this.isConnectionValid = this.isConnectionValid.bind(this)
        this.connectionHandles = new Set()
        this._connectStep = SocketConnector(this)
        this.on('connecting', () => {
            if (this.retryCount > 0) {
                this.emit('reconnecting', this.retryCount)
            }
        })

        this.on('connected', () => {
            this.retryCount = 0
        })
    }

    emit(event, ...args) {
        if (event === 'error') {
            let [err] = args
            const [, ...rest] = args
            err = new ConnectionError(err)
            this.debug('emit', event, ...args)
            return super.emit(event, err, ...rest)
        }

        if (event !== 'message' && typeof event !== 'number') {
            // don't log for messages
            this.debug('emit', event)
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
        const previousConnectionState = this.wantsState
        if (previousConnectionState === STATE.AUTO) {
            return this.emit(event, ...args)
        }

        const result = this.emit(event, ...args)
        if (this.wantsState === STATE.AUTO) {
            return result
        }

        // if event emitter changed wantsState state, throw
        if (previousConnectionState !== this.wantsState) {
            this.debug('transitioned in event handler %s: wantsState %s -> %s', event, previousConnectionState, this.wantsState)
            if (this.wantsState === STATE.CONNECTED) {
                throw new ConnectionError(`connect called in ${event} handler`)
            }

            if (this.wantsState === STATE.DISCONNECTED) {
                throw new ConnectionError(`disconnect called in ${event} handler`)
            }
        }

        return result
    }

    async step() {
        await this._connectStep()
    }

    /**
     * Connection
     */

    async connect() {
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
        autoDisconnect = !!autoDisconnect // eslint-disable-line no-param-reassign
        this.options.autoDisconnect = autoDisconnect
        if (autoDisconnect) {
            this.wantsState = STATE.AUTO
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
            const { autoConnect } = this.options
            let autoConnectMsg = `autoConnect is ${autoConnect}.`
            if (this.didDisableAutoConnect) {
                autoConnectMsg += ' Disabled automatically after explicit call to connect/disconnect().'
            }
            // note we can't just let socket.send fail,
            // have to do this check ourselves because the error appears
            // to be uncatchable in the browser
            throw new ConnectionError(
                `needs connection but connection ${this.getState()}, wants state is ${this.wantsState} and ${autoConnectMsg}.\n${msg}`
            )
        }
    }

    /**
     * Disconnection
     */

    async disconnect() {
        this.didDisableAutoConnect = !!this.options.autoConnect
        this.options.autoConnect = false // reset auto-connect on manual disconnect
        this.options.autoDisconnect = false // reset auto-disconnect on manual disconnect
        this.wantsState = STATE.DISCONNECTED

        await this._connectStep()
        if (this.isConnectionValid()) {
            const err = new ConnectionError('connected before disconnected')
            throw err
        }
    }

    async _disconnect() {
        if (this.connectTask) {
            try {
                await this.connectTask
            } catch (err) {
                // ignore
            }
        }

        if (this.wantsState === STATE.CONNECTED) {
            throw new ConnectionError('connect before disconnect started')
        }

        if (this.isConnected()) {
            this.emitTransition('disconnecting')
        }

        if (this.wantsState === STATE.CONNECTED) {
            throw new ConnectionError('connect while disconnecting')
        }

        await CloseWebSocket(this.socket)

        if (this.wantsState === STATE.CONNECTED) {
            throw new ConnectionError('connect before disconnected')
        }
    }

    async nextDisconnection() {
        if (this.isDisconnected()) {
            return Promise.resolve()
        }

        if (this.disconnectTask) {
            return this.disconnectTask
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
            )
            if (!timeout) {
                this.debug({
                    retryCount: this.retryCount,
                    options: this.options,
                })
            }
            this.debug('waiting %n', timeout)
            this._backoffTimeout = setTimeout(resolve, timeout)
        })
    }

    /**
     * Auto Connect/Disconnect counters.
     */

    async addHandle(id) {
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
            return this._autoDisconnect()
        }

        return Promise.resolve()
    }

    _couldAutoDisconnect() {
        return !!(
            this.options.autoDisconnect
            && this.wantsState !== STATE.CONNECTED
            && this.connectionHandles.size === 0
        )
    }

    async _autoDisconnect() {
        if (this.autoDisconnectTask) {
            return this.autoDisconnectTask
        }

        this.autoDisconnectTask = Promise.resolve().then(async () => {
            await this.step()
            // eslint-disable-next-line promise/always-return
            if (this._couldAutoDisconnect()) {
                this.debug('auto-disconnecting')
                await CloseWebSocket(this.socket)
            }
        }).catch(async (err) => {
            if (err instanceof ConnectionError) {
                // ignore ConnectionErrors because not user-initiated
                return
            }
            throw err
        }).finally(() => {
            this.autoDisconnectTask = undefined
        })

        return this.autoDisconnectTask
    }

    async send(msg) {
        this.sendID = this.sendID + 1 || 1
        const handle = `send${this.sendID}`
        await this.addHandle(handle)
        try {
            this.debug('send()')
            if (!this.isConnected()) {
                // shortcut await if connected
                const data = typeof msg.serialize === 'function' ? msg.serialize() : msg
                await this.needsConnection(`sending ${data.slice(0, 1024)}...`)
            }
            return this._send(msg)
        } finally {
            await this.removeHandle(handle)
        }
    }

    async _send(msg) {
        return new Promise((resolve, reject) => {
            this.debug('>> %o', msg)
            // promisify send
            const data = typeof msg.serialize === 'function' ? msg.serialize() : msg
            this.socket.send(data, (err) => {
                /* istanbul ignore next */
                if (err) {
                    reject(new ConnectionError(err))
                    return
                }
                resolve(data)
            })
            // send callback doesn't exist with browser websockets, just resolve
            /* istanbul ignore next */
            if (process.browser) {
                resolve(data)
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
            if (this.connectTask) { return true }
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

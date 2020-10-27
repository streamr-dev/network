import EventEmitter from 'eventemitter3'
import Debug from 'debug'
import uniqueId from 'lodash.uniqueid'
import WebSocket from 'ws'

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
                throw new ConnectionError('URL is not defined!')
            }
            const socket = new WebSocket(url, ...args)
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

const DEFAULT_MAX_RETRIES = 10

/**
 * Wraps WebSocket open/close with promise methods
 * adds events
 * handles simultaneous calls to open/close
 * waits for pending close/open before continuing
 */

export default class Connection extends EventEmitter {
    static getOpen() {
        return openSockets
    }

    constructor(options) {
        super()
        this.options = options
        this.options.autoConnect = !!this.options.autoConnect
        this.shouldConnect = false
        this.retryCount = 1
        this._isReconnecting = false
        const id = uniqueId('Connection')
        /* istanbul ignore next */
        if (options.debug) {
            this._debug = options.debug.extend(id)
        } else {
            this._debug = Debug(`StreamrClient::${id}`)
        }
        this.debug = this._debug
        this.onConnectError = this.onConnectError.bind(this)
        this.onDisconnectError = this.onDisconnectError.bind(this)
        this.connectionHandles = new Set()
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
        const previousConnectionState = this.shouldConnect
        const result = this.emit(event, ...args)
        // if event emitter changed shouldConnect state, throw
        if (!!previousConnectionState !== !!this.shouldConnect) {
            this.debug('transitioned in event handler %s: shouldConnect %s -> %s', event, previousConnectionState, this.shouldConnect)
            if (this.shouldConnect) {
                throw new ConnectionError(`connect called in ${event} handler`)
            }
            throw new ConnectionError(`disconnect called in ${event} handler`)
        }
        return result
    }

    checkDone() {
        if (!this.isDone && !this._isReconnecting && !this.disconnectTask) {
            this.isDone = true
            this.shouldConnect = false
            this.emit('done')
        }
    }

    /**
     * Connection
     */

    async connect() {
        this.shouldConnect = true
        if (this.connectedOnce) {
            this.options.autoDisconnect = false // reset auto-connect on manual disconnect
        }
        this.connectedOnce = true
        this.shouldReconnect = true
        this.isDone = false

        if (this.initialConnectTask) {
            return this.initialConnectTask
        }

        const initialConnectTask = this._connectOnce()
            .catch((err) => {
                if (this.initialConnectTask === initialConnectTask) {
                    this.initialConnectTask = undefined
                }
                this.debug('error while opening', err)

                // reconnect on initial connection failure
                if (!this.shouldConnect) {
                    throw err
                }

                this.debug = this._debug
                if (this.initialConnectTask === initialConnectTask) {
                    this.initialConnectTask = undefined
                }

                // eslint-disable-next-line promise/no-nesting
                return this.reconnect().catch((error) => {
                    this.debug('failed reconnect during initial connection')
                    throw error
                })
            })
            .catch(this.onConnectError)
            .finally(() => {
                if (this.initialConnectTask === initialConnectTask) {
                    this.initialConnectTask = undefined
                }
            })
        this.initialConnectTask = initialConnectTask
        return this.initialConnectTask
    }

    async _connectOnce() {
        if (this.connectTask) {
            return this.connectTask
        }

        const connectTask = (async () => {
            if (!this.shouldConnect) {
                throw new ConnectionError('disconnected before connected')
            }

            if (this.isConnected()) {
                return Promise.resolve()
            }

            const debug = this._debug.extend('connect')
            if (this.socket && this.socket.readyState === WebSocket.CLOSING) {
                debug('waiting for close...')
                await CloseWebSocket(this.socket)
                debug('closed')
            }

            return this._connect().then((value) => {
                const { socket } = this // capture so we can ignore if not current
                socket.addEventListener('close', async () => {
                    // reconnect on unexpected failure
                    if ((this.socket && socket !== this.socket) || !this.shouldConnect) {
                        return
                    }

                    debug('unexpected close')
                    // eslint-disable-next-line promise/no-nesting
                    await this.reconnect().catch((err) => {
                        this.debug('failed reconnect after connected')
                        this.checkDone()
                        this.emit('error', new ConnectionError(err))
                    })
                })
                return value
            })
        })().finally(() => {
            if (this.connectTask === connectTask) {
                this.connectTask = undefined
            }
        })

        this.connectTask = connectTask
        return this.connectTask
    }

    async _connect() {
        this.debug = this._debug.extend(uniqueId('socket'))
        const { debug } = this
        await true // wait a tick
        debug('connecting...', this.options.url)
        this.emitTransition('connecting')

        if (!this.shouldConnect) {
            // was disconnected in connecting event
            throw new ConnectionError('disconnected before connected')
        }

        const socket = await OpenWebSocket(this.options.url, {
            perMessageDeflate: false,
        })
        debug('connected')
        if (!this.shouldConnect) {
            await CloseWebSocket(socket)
            // was disconnected while connecting
            throw new ConnectionError('disconnected before connected')
        }

        this.socket = socket

        socket.addEventListener('message', (messageEvent, ...args) => {
            if (this.socket !== socket) { return }
            this.emit('message', messageEvent, ...args)
        })

        socket.addEventListener('close', () => {
            debug('closed')

            if (this.socket !== socket) {
                if (this.debug === debug) {
                    this.debug = this._debug
                }
                return
            }

            this.socket = undefined
            this.emit('disconnected')

            if (this.debug === debug) {
                this.debug = this._debug
            }
        })

        socket.addEventListener('error', (err) => {
            if (this.socket !== socket) { return }
            this.emit('error', new ConnectionError(err))
        })

        this.emitTransition('connected')
    }

    async nextConnection() {
        if (this.isConnected()) {
            return Promise.resolve()
        }

        if (this.initialConnectTask) {
            return this.initialConnectTask
        }

        return new Promise((resolve, reject) => {
            let onError
            const onConnected = () => {
                this.off('error', onError)
                resolve()
            }
            onError = (err) => {
                this.off('connected', onConnected)
                reject(err)
            }
            this.once('connected', onConnected)
            this.once('error', onError)
        })
    }

    async triggerConnectionOrWait() {
        return Promise.all([
            this.nextConnection(),
            this.maybeConnect()
        ])
    }

    async maybeConnect() {
        if (this.options.autoConnect || this.shouldConnect) {
            // should be open, so wait for open or trigger new open
            await this.connect()
        }
    }

    async needsConnection(msg) {
        await this.maybeConnect()
        if (!this.isConnected()) {
            const { autoConnect } = this.options
            let autoConnectMsg = `autoConnect is ${autoConnect}.`
            if (this.didDisableAutoConnectAfterDisconnect) {
                autoConnectMsg += ' Disabled automatically after explicit call to disconnect().'
            }
            // note we can't just let socket.send fail,
            // have to do this check ourselves because the error appears
            // to be uncatchable in the browser
            throw new ConnectionError(`needs connection but connection ${this.getState()} and ${autoConnectMsg}.\n${msg}`)
        }
    }

    onConnectError(error) {
        const err = new ConnectionError(error)
        this.checkDone()
        if (!this._isReconnecting) {
            this.emit('error', err)
        }

        throw err
    }

    onDisconnectError(error) {
        const err = new ConnectionError(error)
        // no check for reconnecting
        this.emit('error', err)

        throw err
    }

    /**
     * Disconnection
     */

    async disconnect() {
        this.didDisableAutoConnectAfterDisconnect = !!this.options.autoConnect
        this.options.autoConnect = false // reset auto-connect on manual disconnect
        this.options.autoDisconnect = false // reset auto-disconnect on manual disconnect
        this.shouldConnect = false
        this.shouldReconnect = true
        this._isReconnecting = false

        if (this.disconnectTask) {
            return this.disconnectTask
        }

        let hadError = false
        const disconnectTask = this.__disconnect()
            .catch(async (err) => {
                hadError = true
                return this.onDisconnectError(err)
            })
            .finally(() => {
                this.disconnectTask = undefined
                if (!hadError) {
                    this.checkDone()
                }
            })

        this.disconnectTask = disconnectTask
        return this.disconnectTask
    }

    async __disconnect() {
        if (this.connectTask) {
            try {
                await this.connectTask
            } catch (err) {
                // ignore
            }
        }

        if (this.shouldConnect) {
            throw new ConnectionError('connect before disconnect started')
        }

        if (this.isConnected()) {
            this.emitTransition('disconnecting')
        }

        if (this.shouldConnect) {
            throw new ConnectionError('connect while disconnecting')
        }

        await CloseWebSocket(this.socket)

        if (this.shouldConnect) {
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

    /**
     * Reconnection
     */

    async reconnect() {
        const { maxRetries = DEFAULT_MAX_RETRIES } = this.options
        if (this.reconnectTask) {
            return this.reconnectTask
        }

        if (!this.shouldReconnect) {
            return Promise.resolve()
        }

        const reconnectTask = (async () => {
            if (this.retryCount > maxRetries) {
                // no more retries
                this._isReconnecting = false
                return Promise.resolve()
            }

            // closed, noop
            if (!this.shouldConnect) {
                this._isReconnecting = false
                return Promise.resolve()
            }

            this._isReconnecting = true
            this.debug('reconnect()')
            // wait for a moment
            await this.backoffWait()

            // re-check if closed or closing
            if (!this.shouldConnect) {
                this._isReconnecting = false
                return Promise.resolve()
            }

            if (this.isConnected()) {
                this._isReconnecting = false
                return Promise.resolve()
            }

            const { retryCount } = this
            // try again
            this.debug('attempting to reconnect %s of %s', retryCount, maxRetries)
            this.emitTransition('reconnecting')
            return this._connectOnce().then((value) => {
                this.debug('reconnect %s of %s successful', retryCount, maxRetries)
                // reset retry state
                this.reconnectTask = undefined
                this._isReconnecting = false
                this.retryCount = 1
                return value
            }, (err) => {
                this.debug('attempt to reconnect %s of %s failed', retryCount, maxRetries, err)
                this.debug = this._debug
                this.reconnectTask = undefined
                this.retryCount += 1
                if (this.retryCount > maxRetries) {
                    this.debug('no more retries')
                    // no more retries
                    this._isReconnecting = false
                    throw err
                }
                this.debug('trying again...')
                return this.reconnect()
            })
        })().finally(() => {
            if (this.reconnectTask === reconnectTask) {
                this._isReconnecting = false
                this.reconnectTask = undefined
            }
        })
        this.reconnectTask = reconnectTask
        return this.reconnectTask
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
        this.shouldReconnect = true
        this.connectionHandles.add(id)
    }

    /**
     * When no more handles and autoDisconnect is true, disconnect.
     */

    async removeHandle(id) {
        const hadConnection = this.connectionHandles.has(id)
        this.connectionHandles.delete(id)
        if (hadConnection && this.connectionHandles.size === 0 && this.options.autoDisconnect) {
            return this._autoDisconnect()
        }

        return Promise.resolve()
    }

    async waitForPending() {
        if (this.connectTask || this.disconnectTask) {
            await Promise.all([
                Promise.resolve(this.connectTask).catch(() => {}), // ignore errors
                Promise.resolve(this.disconnectTask).catch(() => {}), // ignore errors
            ])

            await true

            // wait for any additional queued tasks
            return this.waitForPending()
        }
        return Promise.resolve()
    }

    async _autoDisconnect() {
        if (this.autoDisconnectTask) {
            return this.autoDisconnectTask
        }

        this.autoDisconnectTask = Promise.resolve().then(async () => {
            this.shouldReconnect = false
            await this.waitForPending()
            // eslint-disable-next-line promise/always-return
            if (this.connectionHandles.size === 0 && !this.shouldReconnect && this.options.autoDisconnect) {
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
        this.debug('send()')
        if (!this.isConnected()) {
            // shortcut await if connected
            const data = typeof msg.serialize === 'function' ? msg.serialize() : msg
            await this.needsConnection(`sending ${data.slice(0, 1024)}...`)
        }
        this.debug('>> %o', msg)
        return this._send(msg)
    }

    async _send(msg) {
        return new Promise((resolve, reject) => {
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

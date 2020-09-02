import { PassThrough, Writable, pipeline } from 'stream'

import EventEmitter from 'eventemitter3'
import debugFactory from 'debug'
import uniqueId from 'lodash.uniqueid'
import WebSocket from 'ws'

async function OpenWebSocket(url, ...args) {
    return new Promise((resolve, reject) => {
        try {
            if (!url) {
                throw new Error('URL is not defined!')
            }
            const socket = new WebSocket(url, ...args)
            socket.binaryType = 'arraybuffer'
            socket.onopen = () => resolve(socket)
            let error
            socket.onclose = () => {
                if (error) {
                    reject(error)
                    return
                }
                reject(new Error('socket closed'))
            }
            socket.onerror = (event) => {
                error = event.error || new Error(event)
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

/**
 * Wraps WebSocket open/close with promise methods
 * adds events
 * handles simultaneous calls to open/close
 * waits for pending close/open before continuing
 */

export default class SocketConnection extends EventEmitter {
    constructor(options) {
        super()
        this.options = options
        this.options.autoConnect = !!this.options.autoConnect
        this.options.maxRetries = this.options.maxRetries != null ? this.options.maxRetries : 10
        this.options.retryBackoffFactor = this.options.retryBackoffFactor != null ? this.options.retryBackoffFactor : 1.2
        this.options.maxRetryWait = this.options.maxRetryWait != null ? this.options.maxRetryWait : 10000
        this.shouldConnect = false
        this.retryCount = 1
        this._isReconnecting = false
        const id = uniqueId('SocketConnection')
        /* istanbul ignore next */
        if (options.debug) {
            this._debug = options.debug.extend(id)
        } else {
            this._debug = debugFactory(`StreamrClient::${id}`)
        }
        this.debug = this._debug
    }

    async backoffWait() {
        return new Promise((resolve) => {
            clearTimeout(this._backoffTimeout)
            const timeout = Math.min(
                this.options.maxRetryWait, // max wait time
                Math.round((this.retryCount * 10) ** this.options.retryBackoffFactor)
            )
            this.debug('waiting %sms', timeout)
            this._backoffTimeout = setTimeout(resolve, timeout)
        })
    }

    emit(event, ...args) {
        if (event === 'error') {
            this.debug('emit', event, args)
            return super.emit(event, ...args)
        }
        this.debug('emit', event)

        // note if event handler is async and it rejects we're kinda hosed
        // until node lands unhandledrejection support
        // in eventemitter
        try {
            return super.emit(event, ...args)
        } catch (err) {
            super.emit('error', err)
            return true
        }
    }

    async reconnect(...args) {
        if (this.reconnectTask) {
            return this.reconnectTask
        }

        const reconnectTask = (async () => {
            if (this.retryCount > this.options.maxRetries) {
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
            const { maxRetries } = this.options
            // try again
            this.debug('attempting to reconnect %s of %s', retryCount, maxRetries)
            this.emit('reconnecting')
            return this._connectOnce(...args).then((value) => {
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
                if (this.retryCount > this.options.maxRetries) {
                    this.debug('no more retries')
                    // no more retries
                    this._isReconnecting = false
                    throw err
                }
                this.debug('trying again')
                return this.reconnect()
            })
        })().finally(() => {
            if (this.reconnectTask === reconnectTask) {
                this.reconnectTask = undefined
            }
        })
        this.reconnectTask = reconnectTask
        return this.reconnectTask
    }

    async connect() {
        this.shouldConnect = true
        if (this.initialConnectTask) {
            return this.initialConnectTask
        }
        const initialConnectTask = this._connectOnce()
            .catch((err) => {
                if (this.initialConnectTask === initialConnectTask) {
                    this.initialConnectTask = undefined
                }

                // reconnect on initial connection failure
                if (!this.shouldConnect) {
                    throw err
                }

                this.debug('error while opening', err)
                this.debug = this._debug
                if (this.initialConnectTask === initialConnectTask) {
                    this.initialConnectTask = undefined
                }

                // eslint-disable-next-line promise/no-nesting
                return this.reconnect().catch((error) => {
                    this.debug('failed reconnect during initial connection', error)
                    throw error
                })
            }).catch((error) => {
                if (!this._isReconnecting) {
                    this.emit('error', error)
                }
                throw error
            })
            .finally(() => {
                if (this.initialConnectTask === initialConnectTask) {
                    this.initialConnectTask = undefined
                }
            })
        this.initialConnectTask = initialConnectTask
        return this.initialConnectTask
    }

    async reconnectOnUnexpectedClose() {
        if (!this.shouldConnect) {
            return
        }

        this.debug('unexpected close')
        await this.reconnect().catch((error) => {
            this.debug('failed reconnect after connected', error)
            this.emit('error', error)
        })
    }

    async _connectOnce() {
        const { debug } = this
        if (!this.shouldConnect) {
            throw new Error('disconnected before connected')
        }

        if (this.isConnected()) {
            debug('connect(): aleady connected')
            return Promise.resolve()
        }

        if (this.socket && this.socket.readyState === WebSocket.CLOSING) {
            debug('waiting for close')
            await CloseWebSocket(this.socket)
        }

        if (this.connectTask) {
            debug('reuse connection %s', this.socket && this.socket.readyState)
            return this.connectTask
        }

        debug('connect()', this.socket && this.socket.readyState)
        const connectTask = this._connect().then((value) => {
            // reconnect on unexpected failure
            this.socket.addEventListener('close', () => this.reconnectOnUnexpectedClose())
            return value
        }).finally(() => {
            this.connectTask = undefined
        })

        this.connectTask = connectTask
        return this.connectTask
    }

    async _connect() {
        this.debug = this._debug.extend(uniqueId('socket'))
        const { debug } = this
        this.emit('connecting')
        const socket = await OpenWebSocket(this.options.url)
        debug('connected')
        this.socket = socket
        if (!this.shouldConnect) {
            // was disconnected while connecting
            throw new Error('disconnected before connected')
        }

        socket.addEventListener('message', (messageEvent, ...args) => {
            if (this.socket !== socket) { return }
            debug('<< %s', messageEvent && messageEvent.data)
            this.emit('message', messageEvent, ...args)
        })

        socket.addEventListener('close', (event) => {
            debug('closed')
            if (this.socket === socket) {
                this.socket = undefined
                this.emit('disconnected', event)
                this.debug = this._debug
            }
        })

        socket.addEventListener('error', (err) => {
            debug('error', this.socket !== socket, err)
            if (this.socket !== socket) { return }
            const error = err.error || new Error(err)
            if (!this._isReconnecting) {
                this.emit('error', error)
            }
        })

        this.emit('connected')
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

    async disconnect() {
        this.debug('disconnect()')
        this.shouldConnect = false
        if (this.disconnectTask) {
            await this.disconnectTask
        }
        const disconnectTask = this._disconnect()
            .catch((err) => {
                this.emit('error', err)
                throw err
            }).finally(() => {
                if (this.disconnectTask === disconnectTask) {
                    this.disconnectTask = undefined
                }
            })
        this.disconnectTask = disconnectTask
        return this.disconnectTask
    }

    async _disconnect() {
        if (this.connectTask) {
            try {
                await this.connectTask
            } catch (err) {
                // ignore
            }
        }

        if (this.shouldConnect) {
            throw new Error('connected before disconnected')
        }

        if (this.isConnected()) {
            this.emit('disconnecting')
        }

        await CloseWebSocket(this.socket)

        if (this.shouldConnect) {
            throw new Error('connected before disconnected')
        }
    }

    async nextConnection() {
        if (this.isConnected()) {
            return Promise.resolve()
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
        this.debug('maybeConnect', this.options.autoConnect, this.shouldConnect)
        if (this.options.autoConnect || this.shouldConnect) {
            // should be open, so wait for open or trigger new open
            await this.connect()
        }
    }

    async needsConnection() {
        this.debug('needsConnection')
        await this.maybeConnect()
        if (!this.isConnected()) {
            // note we can't just let socket.send fail,
            // have to do this check ourselves because the error appears
            // to be uncatchable in the browser
            throw new Error('connection closed or closing')
        }
    }

    async send(msg) {
        this.debug('send()')
        if (!this.isConnected()) {
            // shortcut await if connected
            await this.needsConnection()
        }
        return this._send(msg)
    }

    async _send(msg) {
        return new Promise((resolve, reject) => {
            this.debug('>> %s', msg)
            // promisify send
            this.socket.send(msg, (err) => {
                /* istanbul ignore next */
                if (err) {
                    reject(err)
                    return
                }
                resolve(msg)
            })
            // send callback doesn't exist with browser websockets, just resolve
            /* istanbul ignore next */
            if (process.isBrowser) {
                resolve(msg)
            }
        })
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
}

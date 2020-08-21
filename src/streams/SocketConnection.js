import EventEmitter from 'eventemitter3'
import debugFactory from 'debug'
import uniqueId from 'lodash.uniqueid'
import WebSocket from 'ws'

/**
 * Wraps WebSocket open/close with promise methods
 * adds events
 * handles simultaneous calls to open/close
 * waits for pending close/open before continuing
 */

class SocketConnection extends EventEmitter {
    constructor(options) {
        super()
        this.options = options
        const id = uniqueId('SocketConnection')
        /* istanbul ignore next */
        if (options.debug) {
            this.debug = options.debug.extend(id)
        } else {
            this.debug = debugFactory(`StreamrClient::${id}`)
        }
    }

    emit(event, ...args) {
        if (event === 'error') {
            return super.emit(event, ...args)
        }

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

    async createSocket() {
        return new Promise((resolve, reject) => {
            if (!this.options.url) {
                throw new Error('URL is not defined!')
            }
            this.socket = new WebSocket(this.options.url)
            this.socket.binaryType = 'arraybuffer'
            this.socket.onopen = (...args) => {
                this.debug('opened')
                resolve(...args)
                this.emit('open', ...args)
            }
            this.socket.onclose = (event = {}) => {
                const { reason, code } = event
                this.debug('unexpected close. code: %s reason: %s', code, reason)
                reject(new Error(`unexpected close. code: ${code}, reason: ${reason}`))
                this.emit('close', event)
            }
            this.socket.onerror = (err, ...args) => {
                const error = err.error || err
                this.debug('error while open', error)
                reject(error)
                this.emit('error', error, ...args)
            }
            this.socket.onmessage = (...args) => {
                this.emit('message', ...args)
            }
        })
    }

    async closeSocket() {
        const { socket } = this
        return new Promise((resolve, reject) => {
            // replace onclose to resolve/reject closeTask
            this.socket.onclose = (event = {}, ...args) => {
                const { reason, code } = event
                this.debug('closed. code: %s reason: %s', code, reason)

                if (this.socket === socket) {
                    // remove socket reference if unchanged
                    this.socket = undefined
                }

                resolve(event)
                this.emit('close', event, ...args)
            }

            /* istanbul ignore next */
            this.socket.onerror = (error, ...args) => {
                // not sure it's even possible to have an error fire during close
                this.debug('error while closing', error)
                reject(error)
                this.emit('error', error, ...args)
            }
            this.socket.close()
        })
    }

    async open() {
        if (this.isOpen()) {
            this.openTask = undefined
            return Promise.resolve()
        }

        if (this.openTask) {
            return this.openTask
        }

        const openTask = (async () => {
            this.emit('opening')
            // await pending close operation
            if (this.closeTask) {
                // ignore failed, original close call will reject
                await this.closeTask.catch(() => {})
            }
            return this.createSocket()
        })().finally(() => {
            // remove openTask if unchanged
            if (this.openTask === openTask) {
                this.openTask = undefined
            }
        })

        this.openTask = openTask

        return this.openTask
    }

    async close() {
        if (this.isClosed()) {
            this.closeTask = undefined
            return Promise.resolve()
        }

        if (this.closeTask) {
            return this.closeTask
        }

        const closeTask = (async () => {
            this.emit('closing')
            // await pending open operation
            if (this.openTask) {
                // ignore failed, original open call will reject
                await this.openTask.catch(() => {})
            }
            return this.closeSocket()
        })().finally(() => {
            // remove closeTask if unchanged
            if (this.closeTask === closeTask) {
                this.closeTask = undefined
            }
        })

        this.closeTask = closeTask
        return this.closeTask
    }

    async send(msg) {
        if (!this.shouldBeOpen) {
            throw new Error('connection closed or closing')
        }

        // should be open, so wait for open or trigger new open
        await this.open()

        return new Promise((resolve, reject) => {
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

    /*
     * Status flag methods
     */

    isOpen() {
        if (!this.socket) {
            return false
        }

        return this.socket.readyState === WebSocket.OPEN
    }

    isClosed() {
        if (!this.socket) {
            return true
        }

        return this.socket.readyState === WebSocket.CLOSED
    }

    isClosing() {
        if (!this.socket) {
            return false
        }
        return this.socket.readyState === WebSocket.CLOSING
    }

    isOpening() {
        if (!this.socket) {
            return false
        }
        return this.socket.readyState === WebSocket.CONNECTING
    }
}

/**
 * Extends SocketConnection to include reopening logic.
 */

export default class ManagedSocketConnection extends SocketConnection {
    constructor(...args) {
        super(...args)
        this.options.maxRetries = this.options.maxRetries != null ? this.options.maxRetries : 10
        this.options.retryBackoffFactor = this.options.retryBackoffFactor != null ? this.options.retryBackoffFactor : 1.2
        this.options.maxRetryWait = this.options.maxRetryWait != null ? this.options.maxRetryWait : 10000
        this.reopenOnClose = this.reopenOnClose.bind(this)
        this.retryCount = 1
        this.isReopening = false
    }

    async backoffWait() {
        return new Promise((resolve) => {
            const timeout = Math.min(
                this.options.maxRetryWait, // max wait time
                Math.round((this.retryCount * 10) ** this.options.retryBackoffFactor)
            )
            this.debug('waiting %sms', timeout)
            setTimeout(resolve, timeout)
        })
    }

    async reopen(...args) {
        await this.reopenTask
        this.reopenTask = (async () => {
            // closed, noop
            if (!this.shouldBeOpen) {
                this.isReopening = false
                return Promise.resolve()
            }
            this.isReopening = true
            // wait for a moment
            await this.backoffWait()

            // re-check if closed or closing
            if (!this.shouldBeOpen) {
                this.isReopening = false
                return Promise.resolve()
            }

            this.emit('retry')
            this.debug('attempting to reopen %s of %s', this.retryCount, this.options.maxRetries)

            return this._open(...args).then((value) => {
                // reset retry state
                this.reopenTask = undefined
                this.retryCount = 1
                this.isReopening = false
                return value
            }, (err) => {
                this.debug('attempt to reopen %s of %s failed', this.retryCount, this.options.maxRetries, err)
                this.reopenTask = undefined
                this.retryCount += 1
                if (this.retryCount > this.options.maxRetries) {
                    // no more retries
                    this.isReopening = false
                    throw err
                }
                // try again
                return this.reopen()
            })
        })()
        return this.reopenTask
    }

    async reopenOnClose() {
        if (!this.shouldBeOpen) {
            return Promise.resolve()
        }

        return this.reopen().catch((error) => {
            this.debug('failed reopening', error)
            this.emit('error', error)
        })
    }

    /**
     * Call this internally so as to not mess with user intent shouldBeOpen
     */

    _open(...args) {
        /* istanbul ignore next */
        if (!this.shouldBeOpen) {
            // shouldn't get here
            throw new Error('cannot tryOpen, connection closed or closing')
        }

        this.removeListener('close', this.reopenOnClose)
        return super.open(...args).then((value) => {
            this.on('close', this.reopenOnClose) // try reopen on close unless purposely closed
            return value
        })
    }

    open(...args) {
        this.shouldBeOpen = true // user intent
        return this._open(...args)
    }

    close(...args) {
        this.shouldBeOpen = false // user intent
        this.removeListener('close', this.reopenOnClose)
        return super.close(...args)
    }
}

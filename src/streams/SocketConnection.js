import EventEmitter from 'eventemitter3'
import debugFactory from 'debug'
import uniqueId from 'lodash.uniqueid'
import WebSocket from 'ws'

/**
 * Wraps WebSocket open/close with promise methods
 * adds events
 * reopens on unexpected closure
 * handles simultaneous calls to open/close
 * waits for pending close/open before continuing
 */

export default class SocketConnection extends EventEmitter {
    constructor(options) {
        super()
        this.options = options
        this.shouldBeOpen = false
        if (!options.url) {
            throw new Error('URL is not defined!')
        }
        const id = uniqueId('SocketConnection')
        if (options.debug) {
            this.debug = options.debug.extend(id)
        } else {
            this.debug = debugFactory(`StreamrClient::${id}`)
        }
    }

    async tryReopen(...args) {
        this.debug('attempting to reopen')
        return this.open(...args)
    }

    async open() {
        this.shouldBeOpen = true
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

            return new Promise((resolve, reject) => {
                this.socket = new WebSocket(this.options.url)
                this.socket.binaryType = 'arraybuffer'
                this.socket.onopen = (...args) => {
                    this.debug('opened')
                    resolve(...args)
                    this.emit('open', ...args)
                }
                this.socket.onclose = (event = {}) => {
                    const { reason, code } = event
                    this.debug('unexpected close', {
                        code,
                        reason,
                    })
                    reject(new Error(`unexpected close. code: ${code}, reason: ${reason}`))
                    this.emit('close', event)
                    this.tryReopen().catch((error) => {
                        this.debug('error reopening', {
                            error,
                        })
                        this.emit('error', error)
                    })
                }
                this.socket.onerror = (err, ...args) => {
                    const error = err.error || err
                    this.debug('error while open', {
                        error,
                    })
                    reject(error)
                    this.emit('error', error, ...args)
                }
                this.socket.onmessage = (...args) => {
                    this.emit('message', ...args)
                }
            })
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
        this.shouldBeOpen = false
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
            const { socket } = this
            return new Promise((resolve, reject) => {
                // replace onclose to resolve/reject closeTask
                this.socket.onclose = (...args) => {
                    this.debug('closed')
                    if (this.socket === socket) {
                        // remove socket reference if unchanged
                        this.socket = undefined
                    }

                    resolve(...args)
                    this.emit('close', ...args)
                }
                this.socket.onerror = (error, ...args) => {
                    this.debug('error while closing', {
                        error,
                    })
                    reject(error)
                    this.emit('error', error, ...args)
                }
                this.socket.close()
            })
        })().finally(() => {
            // remove closeTask if unchanged
            if (this.closeTask === closeTask) {
                this.closeTask = undefined
            }
        })

        this.closeTask = closeTask
        return this.closeTask
    }

    async waitForOpen() {
        if (!this.shouldBeOpen) {
            throw new Error('connection closed or closing')
        }

        if (!this.isOpen()) {
            return this.open()
        }

        return Promise.resolve()
    }

    async send(msg) {
        await this.waitForOpen()

        return new Promise((resolve, reject) => {
            // promisify send
            this.socket.send(msg, (err) => {
                if (err) {
                    reject(err)
                    return
                }
                resolve(msg)
            })
            // send callback doesn't exist with browser websockets, just resolve
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

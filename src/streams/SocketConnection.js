import EventEmitter from 'eventemitter3'
import debugFactory from 'debug'
import uniqueId from 'lodash.uniqueid'
import WebSocket from 'ws'

/**
 * Wraps WebSocket open/close with promise methods
 * adds events
 * reconnects on unexpected closure
 * handles simultaneous calls to open/close
 * waits for pending close/open before continuing
 */

export default class SocketConnection extends EventEmitter {
    constructor(options) {
        super()
        this.options = options
        this.attempts = 0
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

    async open() {
        if (this.isOpen()) {
            this.openTask = undefined
            return Promise.resolve()
        }

        if (this.openTask) {
            return this.openTask
        }

        const openTask = (async () => {
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
                    try {
                        this.emit('open', ...args)
                    } catch (err) {
                        reject(err)
                        return
                    }
                    resolve(...args)
                }
                this.socket.onclose = (code, reason) => {
                    const msg = `unexpected close. code: ${code}, reason: ${reason}`
                    this.debug(msg)
                    reject(new Error(msg))
                    this.open()
                }
                this.socket.onerror = (error, ...args) => {
                    this.debug(`error: ${error || error.stack}`)
                    try {
                        this.emit('error', error, ...args)
                    } catch (err) {
                        reject(err)
                        return
                    }
                    reject(error)
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
        if (this.isClosed()) {
            this.closeTask = undefined
            return Promise.resolve()
        }

        if (this.closeTask) {
            return this.closeTask
        }

        const closeTask = (async () => {
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
                    try {
                        this.emit('close', ...args)
                    } catch (err) {
                        reject(err)
                        return
                    }
                    resolve(...args)
                }
                this.socket.onerror = (error, ...args) => {
                    this.debug(`error: ${error || error.stack}`)
                    try {
                        this.emit('error', error, ...args)
                    } catch (err) {
                        reject(err)
                        return
                    }
                    reject(error)
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

    async send(msg) {
        if (!this.isOpen()) {
            throw new Error('cannot send, not open')
        }
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
        return this.socket.readyState === WebSocket.OPENING
    }
}

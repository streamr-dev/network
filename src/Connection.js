import EventEmitter from 'eventemitter3'
import debugFactory from 'debug'
import uniqueId from 'lodash.uniqueid'
import WebSocket from 'ws'
import { ControlLayer } from 'streamr-client-protocol'

class Connection extends EventEmitter {
    constructor(options, socket) {
        super()
        if (!options.url) {
            throw new Error('URL is not defined!')
        }
        const id = uniqueId('Connection')
        if (options.debug) {
            this.debug = options.debug.extend(id)
        } else {
            this.debug = debugFactory(`StreamrClient::${id}`)
        }
        this.options = options
        this.state = Connection.State.DISCONNECTED
        this.socket = socket
        this._reconnectTimeout = null
    }

    updateState(state) {
        this.state = state
        this.emit(state)
    }

    connect() {
        if (this.state === Connection.State.CONNECTING) {
            return Promise.reject(new Error('Already connecting!'))
        }

        if (this.state === Connection.State.CONNECTED) {
            return Promise.reject(new Error('Already connected!'))
        }

        if (this.state === Connection.State.DISCONNECTING) {
            return new Promise((resolve) => {
                this.once('disconnected', () => resolve(this.connect()))
            })
        }

        if (!this.socket || this.socket.readyState === WebSocket.CLOSED) {
            try {
                this.debug('Trying to open new websocket to %s', this.options.url)
                this.socket = new WebSocket(this.options.url)
            } catch (err) {
                this.emit('error', err)
                this.debug(err)
                return Promise.reject(err)
            }
        }
        this.socket.binaryType = 'arraybuffer'
        this.socket.events = new EventEmitter()

        this.socket.onopen = () => this.socket.events.emit('open')
        this.socket.onclose = () => this.socket.events.emit('close')
        this.socket.onerror = () => this.socket.events.emit('error')

        this.updateState(Connection.State.CONNECTING)

        this.socket.events.on('open', () => {
            this.debug('Connected to ', this.options.url)
            this.updateState(Connection.State.CONNECTED)
        })

        this.socket.events.on('error', (err) => {
            this.debug('Error in websocket.')
            if (err) {
                console.error(err)
            }
            this.socket.close()
        })

        this.socket.events.on('close', () => {
            if (this.state !== Connection.State.DISCONNECTING) {
                this.debug('Connection lost. Attempting to reconnect')
                clearTimeout(this._reconnectTimeout)
                this._reconnectTimeout = setTimeout(() => {
                    this.connect().catch((err) => {
                        console.error(err)
                    })
                }, 2000)
            }

            this.updateState(Connection.State.DISCONNECTED)
        })

        this.socket.onmessage = (messageEvent) => {
            let controlMessage
            try {
                this.debug('<< %s', messageEvent.data)
                controlMessage = ControlLayer.ControlMessage.deserialize(messageEvent.data)
            } catch (err) {
                this.emit('error', err)
                return
            }
            this.emit(controlMessage.type, controlMessage)
        }

        return new Promise((resolve) => {
            this.socket.events.once('open', () => {
                resolve()
            })
        })
    }

    clearReconnectTimeout() {
        clearTimeout(this._reconnectTimeout)
    }

    disconnect() {
        this.clearReconnectTimeout()

        if (this.state === Connection.State.DISCONNECTING) {
            return Promise.reject(new Error('Already disconnecting!'))
        }

        if (this.state === Connection.State.DISCONNECTED) {
            return Promise.reject(new Error('Already disconnected!'))
        }

        if (this.socket === undefined) {
            return Promise.reject(new Error('Something is wrong: socket is undefined!'))
        }

        if (this.state === Connection.State.CONNECTING) {
            return new Promise((resolve) => {
                this.once('connected', () => resolve(this.disconnect().catch((err) => console.error(err))))
            })
        }

        return new Promise((resolve) => {
            this.updateState(Connection.State.DISCONNECTING)
            this.socket.events.once('close', resolve)
            this.socket.close()
        })
    }

    async send(controlLayerRequest) {
        return new Promise((resolve, reject) => {
            try {
                const serialized = controlLayerRequest.serialize()
                this.debug('>> %s', serialized)
                this.socket.send(serialized, (err) => {
                    if (err) {
                        reject(err)
                    } else {
                        resolve(controlLayerRequest)
                    }
                })

                if (process.browser) {
                    resolve()
                }
            } catch (err) {
                this.emit('error', err)
                reject(err)
            }
        })
    }
}

Connection.State = {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    DISCONNECTING: 'disconnecting',
}

export default Connection


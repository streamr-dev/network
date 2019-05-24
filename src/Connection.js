import EventEmitter from 'eventemitter3'
import debugFactory from 'debug'
import WebSocket from 'ws'

import { ControlLayer } from 'streamr-client-protocol'

const debug = debugFactory('StreamrClient::Connection')

class Connection extends EventEmitter {
    constructor(options, socket) {
        super()
        if (!options.url) {
            throw new Error('URL is not defined!')
        }
        this.options = options
        this.state = Connection.State.DISCONNECTED
        this.socket = socket
    }

    updateState(state) {
        this.state = state
        this.emit(state)
    }

    connect() {
        if (this.state === Connection.State.CONNECTING) {
            return Promise.reject(new Error('Already connecting!'))
        } else if (this.state === Connection.State.CONNECTED) {
            return Promise.reject(new Error('Already connected!'))
        }
        if (this.state === Connection.State.DISCONNECTING) {
            return new Promise((resolve) => {
                this.once('disconnected', () => resolve(this.connect()))
            })
        }
        if (!this.socket || this.socket.readyState === WebSocket.CLOSED) {
            try {
                this.socket = new WebSocket(this.options.url)
            } catch (err) {
                this.emit('error', err)
                return Promise.reject(err)
            }
        }
        this.socket.binaryType = 'arraybuffer'
        this.socket.events = new EventEmitter()
        this.socket.onopen = () => this.socket.events.emit('open')
        this.socket.onclose = () => this.socket.events.emit('close')

        this.updateState(Connection.State.CONNECTING)

        this.socket.events.on('open', () => {
            debug('Connected to ', this.options.url)
            this.updateState(Connection.State.CONNECTED)
        })

        this.socket.events.on('close', () => {
            if (this.state !== Connection.State.DISCONNECTING) {
                debug('Connection lost. Attempting to reconnect')
                setTimeout(() => {
                    this.connect()
                }, 2000)
            }

            this.updateState(Connection.State.DISCONNECTED)
        })

        this.socket.onmessage = (messageEvent) => {
            let controlMessage
            try {
                debug('<< %s', messageEvent.data)
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

    disconnect() {
        if (this.state === Connection.State.DISCONNECTING) {
            return Promise.reject(new Error('Already disconnecting!'))
        } else if (this.state === Connection.State.DISCONNECTED) {
            return Promise.reject(new Error('Already disconnected!'))
        } else if (this.socket === undefined) {
            return Promise.reject(new Error('Something is wrong: socket is undefined!'))
        }
        if (this.state === Connection.State.CONNECTING) {
            return new Promise((resolve) => {
                this.once('connected', () => resolve(this.disconnect()))
            })
        }

        return new Promise((resolve) => {
            this.updateState(Connection.State.DISCONNECTING)
            this.socket.events.once('close', resolve)
            this.socket.close()
        })
    }

    send(controlLayerRequest) {
        try {
            const serialized = controlLayerRequest.serialize()
            debug('>> %s', serialized)
            this.socket.send(serialized)
        } catch (err) {
            this.emit('error', err)
        }
        return controlLayerRequest
    }
}

Connection.State = {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    DISCONNECTING: 'disconnecting',
}

export default Connection


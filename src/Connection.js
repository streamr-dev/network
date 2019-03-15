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

        if (options.autoConnect) {
            this.connect()
        }
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
        this.socket = this.socket || new WebSocket(this.options.url)
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
            try {
                const controlMessage = ControlLayer.ControlMessage.deserialize(messageEvent.data)
                this.emit(controlMessage.type, controlMessage)
            } catch (err) {
                this.emit('error', err)
            }
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

        return new Promise((resolve) => {
            this.updateState(Connection.State.DISCONNECTING)
            this.socket.events.once('close', resolve)
            this.socket.close()
        })
    }

    send(controlLayerRequest) {
        try {
            this.socket.send(controlLayerRequest.serialize())
        } catch (err) {
            this.emit('error', err)
        }
    }
}

Connection.State = {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    DISCONNECTING: 'disconnecting',
}

module.exports = Connection

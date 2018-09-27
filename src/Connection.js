import EventEmitter from 'eventemitter3'
import debugFactory from 'debug'
import WebSocket from 'ws'
import { decodeBrowserWrapper, decodeMessage } from './Protocol'

const debug = debugFactory('StreamrClient::Connection')

class Connection extends EventEmitter {
    constructor(options) {
        super()
        if (!options.url) {
            throw new Error('URL is not defined!')
        }
        this.options = options
        this.state = Connection.State.DISCONNECTED

        if (options.autoConnect) {
            this.connect()
        }
    }

    updateState(state) {
        this.state = state
        this.emit(state)
    }

    connect() {
        if (this.state !== Connection.State.CONNECTING && this.state !== Connection.State.CONNECTED) {
            this.socket = this.options.socket || new WebSocket(this.options.url)
            this.socket.binaryType = 'arraybuffer'

            this.updateState(Connection.State.CONNECTING)

            this.socket.onopen = () => {
                debug('Connected to ', this.options.url)
                this.updateState(Connection.State.CONNECTED)
            }

            this.socket.onclose = () => {
                if (this.state !== Connection.State.DISCONNECTING) {
                    debug('Connection lost. Attempting to reconnect')
                    setTimeout(() => {
                        this.connect()
                    }, 2000)
                }

                this.updateState(Connection.State.DISCONNECTED)
            }

            this.socket.onmessage = (messageEvent) => {
                try {
                    const decodedWrapper = decodeBrowserWrapper(messageEvent.data)
                    const decodedMessage = decodeMessage(decodedWrapper.type, decodedWrapper.msg)
                    this.emit(decodedWrapper.type, decodedMessage, decodedWrapper.subId)
                } catch (err) {
                    this.emit('error', err)
                }
            }
        }
    }

    disconnect() {
        if (this.socket !== undefined && (this.state === Connection.State.CONNECTED || this.state === Connection.State.CONNECTING)) {
            this.updateState(Connection.State.DISCONNECTING)
            this.socket.close()
        }
    }

    send(req) {
        try {
            this.socket.send(JSON.stringify(req))
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

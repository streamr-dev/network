import { EventEmitter } from 'events'
import { ConnectionSource, Event as ConnectionSourceEvent } from './ConnectionSource'
import { ClientWebSocket } from './ClientWebSocket'
import { Event as ConnectionEvent, Connection } from './Connection'

export class WebSocketConnector extends EventEmitter implements ConnectionSource {

    connect({ host, port, url }: { host?: string; port?: number; url?: string; } = {}): void {
        const socket = new ClientWebSocket()

        socket.once(ConnectionEvent.CONNECTED, () => {
            this.emit(ConnectionSourceEvent.NEW_CONNECTION, socket)
        })

        let address = ''
        if (url) {
            address = url
        }
        else if (host && port) {
            address = 'ws://' + host + ':' + port
        }

        socket.connect(address)
    }

    connectAsync({ host, port, url, timeoutMs }:
        { host?: string; port?: number; url?: string; timeoutMs: number } = { timeoutMs: 1000 }): Promise<Connection> {
        return new Promise((resolve, reject) => {
            const socket = new ClientWebSocket()

            const connectHandler = () => {
                clearTimeout(timeout)
                socket.off(ConnectionEvent.ERROR, errorHandler)
                resolve(socket)
            }

            const errorHandler = () => {
                //console.log('errorHandler of WebSocketConnector::connectAsync()')
                clearTimeout(timeout)
                reject()
            }

            const timeoutHandler = () => {
                socket.off(ConnectionEvent.ERROR, errorHandler)
                reject()
            }

            const timeout = setTimeout(timeoutHandler, timeoutMs)

            socket.once(ConnectionEvent.CONNECTED, connectHandler)
            socket.once(ConnectionEvent.ERROR, errorHandler)

            let address = ''
            if (url) {
                address = url
            }
            else if (host && port) {
                address = 'ws://' + host + ':' + port
            }

            socket.connect(address)
        })
    }
}

import { EventEmitter } from 'events'
import { IConnectionSource, Event as ConnectionSourceEvent } from '../IConnectionSource'
import { ClientWebSocket } from './ClientWebSocket'
import { Event as ConnectionEvent, Connection } from '../Connection'

export class WebSocketConnector extends EventEmitter implements IConnectionSource {

    connect({ host, port, url }: { host?: string; port?: number; url?: string; } = {}): ClientWebSocket {
        const socket = new ClientWebSocket()

        socket.once(ConnectionEvent.CONNECTED, () => {
            this.emit(ConnectionSourceEvent.CONNECTED, socket)
        })
        
        let address = ''
        if (url) {
            address = url
        }
        else if (host && port) {
            address = 'ws://' + host + ':' + port
        }

        socket.connect(address)
        return socket
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

    // Security check
    withinPortRange(port: number): boolean {
        // Check that requested connections is withing acceted range
        return !!port
    }

}

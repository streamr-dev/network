/* eslint-disable no-console */

import { EventEmitter } from 'events'
import { Connection, Event as ConnectionEvent } from './Connection'
import { connection  as WsConnection} from 'websocket'

export class ServerWebSocket extends EventEmitter implements Connection {

    private socket: WsConnection
    constructor(socket: WsConnection) {
        super()
        
        socket.on('message', (message) => {
            if (message.type === 'utf8') {
                console.log('Received Message: ' + message.utf8Data)
            }
            else if (message.type === 'binary') {
                console.log('Received Binary Message of ' + message.binaryData.length + ' bytes')
                this.emit(ConnectionEvent.DATA, message.binaryData)
            }
        })
        socket.on('close', (reasonCode, description) => {
            //console.log((new Date()) + ' Peer ' + socket.remoteAddress + ' disconnected.')
            this.emit(ConnectionEvent.DISCONNECTED,reasonCode, description)
        })

        socket.on('error', (error) => {
            this.emit(ConnectionEvent.ERROR, error.name)
        })

        this.socket = socket
    }

    send(data: Uint8Array): void {
        this.socket.sendBytes(Buffer.from(data))
    }

    close(): void {
        this.socket.close()
    }
}
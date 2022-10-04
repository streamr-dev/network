import EventEmitter from 'eventemitter3'
import { IConnection, ConnectionID, ConnectionEvents, ConnectionType } from '../IConnection'
import { connection as WsConnection } from 'websocket'
import { Logger } from '@streamr/utils'

const logger = new Logger(module)

// NodeJsBuffer is global defined in preload.js of Karma
// It is used to make Karma/Electron tests to use the NodeJS
// implementation of Buffer instead of the browser polyfill

declare let NodeJsBuffer: BufferConstructor

enum MessageType {
    UTF8 = 'utf8',
    BINARY = 'binary'
}

export class ServerWebSocket extends EventEmitter<ConnectionEvents> implements IConnection {
   
    public connectionId: ConnectionID
    private socket: WsConnection
    public connectionType = ConnectionType.WEBSOCKET_SERVER

    constructor(socket: WsConnection) {
        super()

        this.connectionId = new ConnectionID()

        socket.on('message', (message) => {
            logger.trace('ServerWebSocket::onMessage')
            if (message.type === MessageType.UTF8) {
                logger.debug('Received string Message: ' + message.utf8Data)
            } else if (message.type === MessageType.BINARY) {
                logger.trace('Received Binary Message of ' + message.binaryData.length + ' bytes')
                this.emit('data',
                    new Uint8Array(message.binaryData.buffer, message.binaryData.byteOffset, 
                        message.binaryData.byteLength / Uint8Array.BYTES_PER_ELEMENT))
            }
        })
        socket.on('close', (reasonCode, description) => {
            logger.trace(' Peer ' + socket.remoteAddress + ' disconnected.')
            this.emit('disconnected', reasonCode, description)
        })

        socket.on('error', (error) => {
            this.emit('error', error.name)
        })

        this.socket = socket
    }

    send(data: Uint8Array): void {
        logger.trace('serverwebsocket trying to send ' + JSON.stringify(data))
        // If in an Karma / Electron test, use the NodeJS implementation
        // of Buffer instead of the browser polyfill
        if (typeof NodeJsBuffer !== 'undefined') {
            this.socket.sendBytes(NodeJsBuffer.from(data))
        } else {
            this.socket.sendBytes(Buffer.from(data))
        }
    }

    close(): void {
        this.socket.close()
    }

    public getRemoteAddress(): string {
        return this.socket.remoteAddress
    }

    stop(): void {
        this.removeAllListeners()
    }
}

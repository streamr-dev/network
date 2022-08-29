import { IConnection, ConnectionID, Event as ConnectionEvent, ConnectionType } from '../IConnection'
import { w3cwebsocket as WebSocket, ICloseEvent, IMessageEvent } from 'websocket'
import { EventEmitter } from 'events'
import { Logger } from '@streamr/utils'

const logger = new Logger(module)

const BINARY_TYPE = 'arraybuffer'

export class ClientWebSocket extends EventEmitter implements IConnection {
    public readonly connectionId: ConnectionID
    private socket: WebSocket | null = null
    public connectionType = ConnectionType.WEBSOCKET_CLIENT

    constructor() {
        super()
        this.connectionId = new ConnectionID()
    }

    connect(address: string): void {
        this.socket = new WebSocket(address)
        this.socket.binaryType = BINARY_TYPE
        this.socket.onerror = (error: Error) => {
            logger.trace('WebSocket Client error: ' + error)
            this.emit(ConnectionEvent.ERROR, error.name)
        }
        
        this.socket.onopen = () => {
            logger.trace('WebSocket Client Connected')
            if (this.socket && this.socket.readyState === this.socket.OPEN) {
                this.emit(ConnectionEvent.CONNECTED)
            }  
        }
        
        this.socket.onclose = (event: ICloseEvent ) => {
            logger.trace('Websocket Closed')
            this.emit(ConnectionEvent.DISCONNECTED, event.code, event.reason)
        }
        
        this.socket.onmessage = (message: IMessageEvent) => {
            if (typeof message.data === 'string') {
                logger.debug("Received string: '" + message.data + "'")
            } else {
                this.emit(ConnectionEvent.DATA, new Uint8Array(message.data))
                logger.trace("Received data: '" + message.data + "'")
            }
        }
    }

    send(data: Uint8Array): void {
        if (this.socket && this.socket.readyState === this.socket.OPEN) {
            logger.trace(`Sending data with size ${data.byteLength}`)
            this.socket?.send(data.buffer)
        } else {
            logger.warn('Tried to send data on a non-open connection')
        }
    }

    close(): void {
        logger.trace(`Closing socket for connection ${this.connectionId.toString()}`)
        this.socket?.close()
    }
}

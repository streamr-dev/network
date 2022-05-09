/* eslint-disable no-console */

import { Connection, Event as ConnectionEvent } from '../Connection'
import { w3cwebsocket as WebSocket, ICloseEvent, IMessageEvent} from 'websocket'
import { EventEmitter } from 'events'
import { ConnectionID } from '../../types'
import { PeerDescriptor } from '../../proto/DhtRpc'

export class ClientWebSocket extends EventEmitter implements Connection {
    public connectionId: ConnectionID
    private remotePeerDescriptor: PeerDescriptor|null = null
    private buffer: Uint8Array[] = []
    private socket: WebSocket | null = null

    constructor() {
        super()
        this.connectionId = new ConnectionID()
    }

    connect(address: string): void {
        this.socket = new WebSocket(address)
    
        this.socket.onerror = (error: Error) => {
            //console.log('Error', error)
            this.emit(ConnectionEvent.ERROR, error.name)
        }
        
        this.socket.onopen = () => {
            console.log('WebSocket Client Connected')
            if (this.socket && this.socket.readyState === this.socket.OPEN) {
                this.emit(ConnectionEvent.CONNECTED)
            }  
        }
        
        this.socket.onclose = (event: ICloseEvent ) => {
            //console.log('Websocket Closed')
            this.emit(ConnectionEvent.DISCONNECTED, event.code, event.reason)
        }
        
        this.socket.onmessage = (message: IMessageEvent) => {
            if (typeof message.data === 'string') {
                console.log("Received string: '" + message.data + "'")
            }
            else {
                this.emit(ConnectionEvent.DATA, new Uint8Array(message.data))
            }
        }
    }

    send(data: Uint8Array): void {
        if (this.socket && this.socket.readyState === this.socket.OPEN) {
            this.doSend(data)
        }
        else if (this.socket && this.socket.readyState == this.socket.CONNECTING) {
            this.addToBuffer(data)
        }
    }

    public sendBufferedMessages(): void {
        while (this.buffer.length > 0) {
            this.send(this.buffer.shift() as Uint8Array)
        }
    }

    close(): void {
        this.socket?.close()
    }

    setPeerDescriptor(peerDescriptor: PeerDescriptor): void {
        this.remotePeerDescriptor = peerDescriptor
    }

    get peerDescriptor(): PeerDescriptor | null {
        return this.remotePeerDescriptor
    }

    private doSend(data: Uint8Array): void {
        this.socket?.send(data.buffer)
    }

    private addToBuffer(msg: Uint8Array): void {
        this.buffer.push(msg)
    }
}

/* eslint-disable no-console */

import { EventEmitter } from 'events'
import { Connection, Event as ConnectionEvent } from '../Connection'
import { connection as WsConnection } from 'websocket'
import { ConnectionID } from '../../types'
import { PeerDescriptor } from '../../proto/DhtRpc'

export class ServerWebSocket extends EventEmitter implements Connection {
    public connectionId: ConnectionID
    private socket: WsConnection
    private remotePeerDescriptor: PeerDescriptor|null = null

    constructor(socket: WsConnection) {
        super()

        this.connectionId = new ConnectionID()

        socket.on('message', (message) => {
            console.log('ServerWebSocket::onMessage')
            if (message.type === 'utf8') {
                console.log('Received Message: ' + message.utf8Data)
            }
            else if (message.type === 'binary') {
                console.log('Received Binary Message of ' + message.binaryData.length + ' bytes')
                this.emit(ConnectionEvent.DATA,
                    new Uint8Array(message.binaryData.buffer, message.binaryData.byteOffset, 
                        message.binaryData.byteLength / Uint8Array.BYTES_PER_ELEMENT))
            }
        })
        socket.on('close', (reasonCode, description) => {
            //console.log((new Date()) + ' Peer ' + socket.remoteAddress + ' disconnected.')
            this.emit(ConnectionEvent.DISCONNECTED, reasonCode, description)
        })

        socket.on('error', (error) => {
            this.emit(ConnectionEvent.ERROR, error.name)
        })

        this.socket = socket
    }

    send(data: Uint8Array): void {
        this.socket.sendBytes(Buffer.from(data))
    }

    sendBufferedMessages(): void {
    }

    close(): void {
        this.socket.close()
    }

    setPeerDescriptor(peerDescriptor: PeerDescriptor): void {
        this.remotePeerDescriptor = peerDescriptor
    }

    get peerDescriptor(): PeerDescriptor | null {
        return this.remotePeerDescriptor
    }

    public get remoteAddress(): string {
        return this.socket.remoteAddress
    }

    stop(): void {
        this.removeAllListeners()
    }
}
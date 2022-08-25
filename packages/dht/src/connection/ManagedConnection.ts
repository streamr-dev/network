import { Connection } from "./Connection"
import { ConnectionType, Event as ConnectionEvents, IConnection } from "./IConnection"
import * as Err from '../helpers/errors'
import { Handshaker } from "./Handshaker"
import { PeerDescriptor } from "../proto/DhtRpc"
import { IManagedConnection, Event as ManagedConnectionEvents } from "./IManagedConnection"
import { Logger } from "@streamr/utils"

const logger = new Logger(module)

export class ManagedConnection extends Connection implements IConnection, IManagedConnection {

    private static objectCounter = 0
    private objectId = 0
    private implementation?: IConnection
    
    private outputBuffer: Uint8Array[] = []
    private inputBuffer: [data: Uint8Array, remotePeerDescriptor: PeerDescriptor][] = []
   
    constructor(private ownPeerDescriptor: PeerDescriptor,
        private protocolVersion: string,
        connectionType: ConnectionType,
        protected connectingConnection?: IConnection,
        connectedConnection?: IConnection,
    ) {
        super(connectionType)

        this.objectId = ManagedConnection.objectCounter
        ManagedConnection.objectCounter++

        logger.trace('creating ManagedConnection of type: ' + connectionType + ' objectId: ' + this.objectId)
        if (connectedConnection && connectingConnection) {
            throw new Err.IllegalArguments('Managed connection constructor only accepts either a conncting connection OR a connected connection')
        }

        this.on('newListener', (event, listener) => {
            // empty the input buffer to the first DATA listener added

            if (event == ManagedConnectionEvents.DATA && this.listenerCount(ManagedConnectionEvents.DATA) == 0) {
                while (this.inputBuffer.length > 0) {
                    logger.trace('emptying inputBuffer objectId: ' + this.objectId)
                    const data = (this.inputBuffer.shift()!)
                    listener(data[0], data[1])
                }
            }
        })

        if (connectingConnection) {
            connectingConnection.once(ConnectionEvents.CONNECTED, () => {
                this.attachImplementation(connectingConnection)
                this.emit(ConnectionEvents.CONNECTED)
            })
        } else {
            if (connectedConnection) {
                this.attachImplementation(connectedConnection!)
            }
        }
    }

    private onHandshakeCompleted = (peerDescriptor: PeerDescriptor) => {
        logger.trace('handshake completed objectId: ' + this.objectId)
        this.setPeerDescriptor(peerDescriptor)

        while (this.outputBuffer.length > 0) {
            logger.trace('emptying outputBuffer objectId: ' + this.objectId)
            this.implementation!.send(this.outputBuffer.shift()!)
        }
        this.emit(ManagedConnectionEvents.HANDSHAKE_COMPLETED, peerDescriptor)
    }

    public attachImplementation(impl: IConnection, peerDescriptor?: PeerDescriptor): void {
        logger.trace('attachImplementation() objectId: ' + this.objectId)
        impl.on(ConnectionEvents.DATA, (bytes: Uint8Array) => {
            logger.trace('received data objectId: ' + this.objectId)
           
            if (this.listenerCount(ManagedConnectionEvents.DATA) < 1) {
                logger.trace('pushing data to inputbuffer objectId: ' + this.objectId)
                this.inputBuffer.push([bytes, this.getPeerDescriptor()!])
            } else {
                logger.trace('emitting data as ManagedConnectionEvents.DATA objectId: ' + this.objectId)
                this.emit(ManagedConnectionEvents.DATA, bytes, this.getPeerDescriptor())
            }

            this.emit(ConnectionEvents.DATA, bytes)
        })

        impl.on(ConnectionEvents.ERROR, (name: string) => {
            this.emit(ConnectionEvents.ERROR, name)
        })
        impl.on(ConnectionEvents.CONNECTED, () => {
            this.emit(ConnectionEvents.CONNECTED)
        })
        impl.on(ConnectionEvents.DISCONNECTED, (code: number, reason: string) => {
            this.emit(ConnectionEvents.DISCONNECTED, code, reason)
        })

        this.implementation = impl

        if (!peerDescriptor) {
            const handshaker = new Handshaker(this.ownPeerDescriptor, this.protocolVersion, impl)
            handshaker.on('HANDSHAKE_COMPLETED', (peerDescriptor: PeerDescriptor) => {
                this.onHandshakeCompleted(peerDescriptor)
            })

            handshaker.run()
        } else {
            this.onHandshakeCompleted(peerDescriptor)
        }
    }

    send(data: Uint8Array): void {
        if (this.implementation) {
            this.implementation.send(data)
        } else {
            logger.trace('adding data to outputBuffer objectId: ' + this.objectId)
            this.outputBuffer.push(data)
        }
    }

    close(): void {
        if (this.implementation) {
            this.implementation?.close()
        }
    }
}

import { ConnectionEvent, ConnectionID, ConnectionType, IConnection } from "./IConnection"
import * as Err from '../helpers/errors'
import { Handshaker } from "./Handshaker"
import { PeerDescriptor } from "../proto/DhtRpc"
import { Logger } from "@streamr/utils"
import EventEmitter from "eventemitter3"

export interface ManagedConnectionEvent {
    MANAGED_DATA: (bytes: Uint8Array, remotePeerDescriptor: PeerDescriptor) => void
    HANDSHAKE_COMPLETED: (peerDescriptor: PeerDescriptor) => void
}

const logger = new Logger(module)

type Events = ManagedConnectionEvent & ConnectionEvent
export class ManagedConnection extends EventEmitter<Events> {

    private static objectCounter = 0
    public objectId = 0
    private implementation?: IConnection

    private outputBuffer: Uint8Array[] = []
    private inputBuffer: [data: Uint8Array, remotePeerDescriptor: PeerDescriptor][] = []

    public connectionId: ConnectionID
    private peerDescriptor?: PeerDescriptor
    public connectionType: ConnectionType

    constructor(private ownPeerDescriptor: PeerDescriptor,
        private protocolVersion: string,
        connectionType: ConnectionType,
        protected connectingConnection?: IConnection,
        connectedConnection?: IConnection,
    ) {
        super()
        this.objectId = ManagedConnection.objectCounter
        ManagedConnection.objectCounter++

        this.connectionType = connectionType
        this.connectionId = new ConnectionID()

        logger.trace('creating ManagedConnection of type: ' + connectionType + ' objectId: ' + this.objectId)
        if (connectedConnection && connectingConnection) {
            throw new Err.IllegalArguments('Managed connection constructor only accepts either a conncting connection OR a connected connection')
        }

        if (connectingConnection) {
            connectingConnection.once('CONNECTED', () => {
                this.attachImplementation(connectingConnection)
                this.emit('CONNECTED')
            })
        } else {
            if (connectedConnection) {
                this.attachImplementation(connectedConnection!)
            }
        }
    }

    // eventemitter3 does not implement the standard 'newListener' event, so we need to override
    
    override on(
        event: keyof Events,
        fn: (...args: any) => void,
        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        context?: any
    ): this {
        if (event == 'MANAGED_DATA' && this.listenerCount('MANAGED_DATA') == 0) {
            while (this.inputBuffer.length > 0) {
                logger.trace('emptying inputBuffer objectId: ' + this.objectId)
                const data = (this.inputBuffer.shift()!)
                fn(data[0], data[1])
            }
        }
        super.on(event, fn, context)
        return this
    }

    override once(
        event: keyof Events,
        fn: (...args: any) => void,
        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        context?: any
    ): this {
        logger.trace('overridden once objectId: ' + this.objectId)
        if (event == 'MANAGED_DATA' && this.listenerCount('MANAGED_DATA') == 0) {
            if (this.inputBuffer.length > 0) {
                while (this.inputBuffer.length > 0) {
                    logger.trace('emptying inputBuffer objectId: ' + this.objectId)
                    const data = (this.inputBuffer.shift()!)
                    fn(data[0], data[1])
                }
            } else {
                super.once(event, fn, context)
            }
        } else {
            super.once(event, fn, context)
        }

        return this
    }

    public setPeerDescriptor(peerDescriptor: PeerDescriptor): void {
        this.peerDescriptor = peerDescriptor
    }

    public getPeerDescriptor(): PeerDescriptor | undefined {
        return this.peerDescriptor
    }

    private onHandshakeCompleted = (peerDescriptor: PeerDescriptor) => {
        logger.trace('handshake completed objectId: ' + this.objectId)
        this.setPeerDescriptor(peerDescriptor)

        while (this.outputBuffer.length > 0) {
            logger.trace('emptying outputBuffer objectId: ' + this.objectId)
            this.implementation!.send(this.outputBuffer.shift()!)
        }
        logger.trace('emitting handshake_completed, objectId: ' + this.objectId)
        this.emit('HANDSHAKE_COMPLETED', peerDescriptor)
    }

    public attachImplementation(impl: IConnection, peerDescriptor?: PeerDescriptor): void {
        logger.trace('attachImplementation() objectId: ' + this.objectId)
        impl.on('DATA', (bytes: Uint8Array) => {
            logger.trace('received data objectId: ' + this.objectId)

            if (this.listenerCount('MANAGED_DATA') < 1) {
                logger.trace('pushing data to inputbuffer objectId: ' + this.objectId)
                this.inputBuffer.push([bytes, this.getPeerDescriptor()!])
            } else {
                logger.trace('emitting data as ManagedConnectionEvents.DATA objectId: ' + this.objectId)
                this.emit('MANAGED_DATA', bytes, this.getPeerDescriptor()!)
            }

            //this.emit(ConnectionEvents.DATA, bytes)
        })

        impl.on('ERROR', (name: string) => {
            this.emit('ERROR', name)
        })
        impl.on('CONNECTED', () => {
            this.emit('CONNECTED')
        })
        impl.on('DISCONNECTED', (code?: number, reason?: string) => {
            this.emit('DISCONNECTED', code, reason)
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

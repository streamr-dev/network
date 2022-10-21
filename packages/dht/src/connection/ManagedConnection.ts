import { ConnectionEvents, ConnectionID, ConnectionType, IConnection } from "./IConnection"
import * as Err from '../helpers/errors'
import { Handshaker } from "./Handshaker"
import { PeerDescriptor } from "../proto/DhtRpc"
import { Logger } from "@streamr/utils"
import EventEmitter from "eventemitter3"

export interface ManagedConnectionEvents {
    managedData: (bytes: Uint8Array, remotePeerDescriptor: PeerDescriptor) => void
    handshakeCompleted: (peerDescriptor: PeerDescriptor) => void
}

const logger = new Logger(module)

type Events = ManagedConnectionEvents & ConnectionEvents
export class ManagedConnection extends EventEmitter<Events> {

    private static objectCounter = 0
    public objectId = 0
    private implementation?: IConnection

    private outputBuffer: Uint8Array[] = []
    private inputBuffer: [data: Uint8Array][] = []

    public connectionId: ConnectionID
    private peerDescriptor?: PeerDescriptor
    public connectionType: ConnectionType

    private handshaker?: Handshaker
    private handshakeCompleted = false

    private connectedReceived = false
    constructor(private ownPeerDescriptor: PeerDescriptor,
        private protocolVersion: string,
        connectionType: ConnectionType,
        protected connectingConnection?: IConnection,
        protected connectedConnection?: IConnection,
    ) {
        super()
        this.objectId = ManagedConnection.objectCounter
        ManagedConnection.objectCounter++

        this.connectionType = connectionType
        this.connectionId = new ConnectionID()

        logger.trace('creating ManagedConnection of type: ' + connectionType + ' objectId: ' + this.objectId)
        if (connectedConnection && connectingConnection) {
            throw new Err.IllegalArguments('Managed connection constructor only accepts either a connecting connection OR a connected connection')
        }

        if (connectingConnection) {
            this.handshaker = new Handshaker(this.ownPeerDescriptor, this.protocolVersion, connectingConnection)
            this.handshaker.on('handshakeCompleted', (peerDescriptor: PeerDescriptor) => {
                this.onHandshakeCompleted(peerDescriptor)
            })
            connectingConnection.once('connected', () => {
                this.connectedReceived = true
                this.attachImplementation(connectingConnection)
                this.emit('connected')
            })
            connectingConnection.once('disconnected', () => {
                this.emit('disconnected')
            })
        } else {
            if (connectedConnection) {
                this.handshaker = new Handshaker(this.ownPeerDescriptor, this.protocolVersion, connectedConnection!)
                this.handshaker.on('handshakeCompleted', this.onHandshakeCompleted)
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
        if (event == 'managedData' && this.listenerCount('managedData') == 0) {
            while (this.inputBuffer.length > 0) {
                logger.trace('emptying inputBuffer objectId: ' + this.objectId)
                const data = (this.inputBuffer.shift()!)
                fn(data[0], this.getPeerDescriptor())
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
        if (event == 'managedData' && this.listenerCount('managedData') == 0) {
            if (this.inputBuffer.length > 0) {
                while (this.inputBuffer.length > 0) {
                    logger.trace('emptying inputBuffer objectId: ' + this.objectId)
                    const data = (this.inputBuffer.shift()!)
                    fn(data[0], this.getPeerDescriptor())
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
        this.handshakeCompleted = true

        while (this.outputBuffer.length > 0) {
            logger.trace('emptying outputBuffer objectId: ' + this.objectId)
            if (!this.implementation) {
                logger.info('this.connectingConnection: ' + this.connectingConnection)
                logger.info('this.connectedConnection: ' + this.connectedConnection)
            }
            this.implementation!.send(this.outputBuffer.shift()!)
        }

        logger.trace('emitting handshake_completed, objectId: ' + this.objectId)
        this.emit('handshakeCompleted', peerDescriptor)
    }

    public attachImplementation(impl: IConnection, peerDescriptor?: PeerDescriptor): void {
        logger.trace('attachImplementation() objectId: ' + this.objectId)
        this.implementation = impl

        impl.on('data', (bytes: Uint8Array) => {
            logger.trace('received data objectId: ' + this.objectId)

            if (this.listenerCount('managedData') < 1) {
                logger.trace('pushing data to inputbuffer objectId: ' + this.objectId)
                this.inputBuffer.push([bytes])
            } else {
                logger.trace('emitting data as ManagedConnectionEvents.DATA objectId: ' + this.objectId)
                this.emit('managedData', bytes, this.getPeerDescriptor()!)
            }
        })

        impl.on('error', (name: string) => {
            this.emit('error', name)
        })
        impl.on('connected', () => {
            logger.info('connected emitted')
            this.emit('connected')
        })
        impl.on('disconnected', () => {
            this.emit('disconnected')
        })
        impl.on('disconnected', (code?: number, reason?: string) => {
            this.emit('disconnected', code, reason)
        })

        if (!peerDescriptor) {
            this.handshaker?.run()
        } else {
            this.handshaker?.off('handshakeCompleted', this.onHandshakeCompleted)
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
        } else if (this.connectingConnection) {
            this.connectingConnection?.close()
        }
    }

    isHandshakeCompleted(): boolean {
        return this.handshakeCompleted
    }

    getOutputBuffer(): Uint8Array[] {
        return this.outputBuffer
    }
}

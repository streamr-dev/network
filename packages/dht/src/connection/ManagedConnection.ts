import { ConnectionEvents, ConnectionID, ConnectionType, IConnection } from "./IConnection"
import * as Err from '../helpers/errors'
import { Handshaker } from "./Handshaker"
import { PeerDescriptor } from "../proto/DhtRpc"
import { Logger } from "@streamr/utils"
import EventEmitter from "eventemitter3"
import { raceEvents3 } from "../helpers/waitForEvent3"

export interface ManagedConnectionEvents {
    managedData: (bytes: Uint8Array, remotePeerDescriptor: PeerDescriptor) => void
    handshakeRequest: (peerDescriptor: PeerDescriptor) => void
    handshakeCompleted: (peerDescriptor: PeerDescriptor) => void
    handshakeFailed: () => void
    bufferSentByOtherConnection: () => void
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
        protected outgoingConnection?: IConnection,
        protected incomingConnection?: IConnection,
    ) {
        super()
        this.objectId = ManagedConnection.objectCounter
        ManagedConnection.objectCounter++

        this.connectionType = connectionType
        this.connectionId = new ConnectionID()

        logger.trace('creating ManagedConnection of type: ' + connectionType + ' objectId: ' + this.objectId)
        if (incomingConnection && outgoingConnection) {
            throw new Err.IllegalArguments('Managed connection constructor only accepts either an incoming connection OR a outgoing connection')
        }

        if (outgoingConnection) {
            this.handshaker = new Handshaker(this.ownPeerDescriptor, this.protocolVersion, outgoingConnection)

            this.handshaker.once('handshakeFailed', () => {
                this.emit('handshakeFailed')
            })

            this.handshaker.on('handshakeCompleted', (peerDescriptor: PeerDescriptor) => {
                this.attachImplementation(outgoingConnection!)
                this.onHandshakeCompleted(peerDescriptor)
            })

            outgoingConnection.once('connected', () => {
                this.connectedReceived = true
                //this.attachImplementation(outgoingConnection)
                this.handshaker!.sendHandshakeRequest()
                this.emit('connected')
            })
            outgoingConnection.once('disconnected', () => {
                this.emit('disconnected')
            })
        } else {
            if (incomingConnection) {
                this.handshaker = new Handshaker(this.ownPeerDescriptor, this.protocolVersion, incomingConnection!)
                this.handshaker.on('handshakeRequest', (peerDescriptor: PeerDescriptor) => {
                    this.setPeerDescriptor(peerDescriptor)
                    this.emit('handshakeRequest', peerDescriptor)
                })

                /*
                this.handshaker.on('handshakeCompleted', (peerDescriptor: PeerDescriptor) => {
                    this.attachImplementation(incomingConnection!)
                    this.onHandshakeCompleted(peerDescriptor)
                })
                */
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

            this.implementation!.send(this.outputBuffer.shift()!)
        }

        logger.trace('emitting handshake_completed, objectId: ' + this.objectId)
        this.emit('handshakeCompleted', peerDescriptor)
    }

    public attachImplementation(impl: IConnection, _peerDescriptor?: PeerDescriptor): void {
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
            logger.trace('connected emitted')
            this.emit('connected')
        })
        impl.off('disconnected', () => {
            this.emit('disconnected')
        })
        impl.on('disconnected', (code?: number, reason?: string) => {
            this.emit('disconnected', code, reason)
        })

        /*
      if (!peerDescriptor) {
          this.handshaker?.run()
      } else {
          this.handshaker?.off('handshakeCompleted', this.onHandshakeCompleted)
          this.onHandshakeCompleted(peerDescriptor)
      }
      */
    }

    async send(data: Uint8Array): Promise<void> {
        if (this.implementation) {
            this.implementation.send(data)
        } else {
            logger.trace('adding data to outputBuffer objectId: ' + this.objectId)
            this.outputBuffer.push(data)

            const result = await raceEvents3<Events>(this, ['handshakeCompleted', 'handshakeFailed',
                'bufferSentByOtherConnection', 'disconnected'], 15000)

            if (result.winnerName == 'disconnected') {
                throw new Err.ConnectionFailed()
            }
            if (result.winnerName == 'handshakeFailed') {
                logger.trace('handshakeFailed received')
                //throw new Err.ConnectionFailed()
            }
        }
    }

    sendNoWait(data: Uint8Array): void {
        if (this.implementation) {
            this.implementation.send(data)
        } else {
            logger.trace('adding data to outputBuffer objectId: ' + this.objectId)
            this.outputBuffer.push(data)
        }
    }

    public reportBufferSentByOtherConnection(): void {
        this.emit('bufferSentByOtherConnection')
    }

    public reportBufferSendingByOtherConnectionFailed(): void {
        this.emit('disconnected')
    }

    public acceptHandshake(): void {
        // This happens when connectionRequest has been made and answered
        if (this.implementation) {
            if (!this.handshaker) {
                this.handshaker = new Handshaker(this.ownPeerDescriptor, this.protocolVersion, this.implementation)
            }

            this.handshaker!.sendHandshakeResponse()

        } else {  // This happens to when there is a regular incoming connection
            this.handshaker!.sendHandshakeResponse()
            this.attachImplementation(this.incomingConnection!)
        }

        this.onHandshakeCompleted(this.peerDescriptor!)
    }

    public rejectHandshake(errorMessage: string): void {
        this.handshaker!.sendHandshakeResponse(errorMessage)
    }

    close(): void {
        if (this.implementation) {
            this.implementation?.close()
        } else if (this.outgoingConnection) {
            this.outgoingConnection?.close()
        } else if (this.incomingConnection) {
            this.incomingConnection?.close()
        } else {
            this.emit('disconnected')
        }
    }

    isHandshakeCompleted(): boolean {
        return this.handshakeCompleted
    }

    getOutputBuffer(): Uint8Array[] {
        return this.outputBuffer
    }
}

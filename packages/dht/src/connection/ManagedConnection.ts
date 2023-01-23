import { ConnectionEvents, ConnectionID, ConnectionType, IConnection } from "./IConnection"
import * as Err from '../helpers/errors'
import { Handshaker } from "./Handshaker"
import { PeerDescriptor } from "../proto/packages/dht/protos/DhtRpc"
import { Logger } from "@streamr/utils"
import EventEmitter from "eventemitter3"
import { raceEvents3 } from "../helpers/waitForEvent3"
import { PeerID, PeerIDKey } from "../helpers/PeerID"

export interface ManagedConnectionEvents {
    managedData: (bytes: Uint8Array, remotePeerDescriptor: PeerDescriptor) => void
    handshakeRequest: (peerDescriptor: PeerDescriptor) => void
    handshakeCompleted: (peerDescriptor: PeerDescriptor) => void
    handshakeFailed: () => void
    bufferSentByOtherConnection: () => void
    closing: () => void
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

    private lastUsed: number = Date.now()
    private stopped = false
    public offeredAsIncoming = false
    public rejectedAsIncoming = false
    private bufferSentbyOtherConnection = false
    private closing = false
    public replacedByOtherConnection = false

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

        this.onDisconnected = this.onDisconnected.bind(this)

        logger.trace('creating ManagedConnection of type: ' + connectionType + ' objectId: ' + this.objectId)
        if (incomingConnection && outgoingConnection) {
            throw new Err.IllegalArguments('Managed connection constructor only accepts either an incoming connection OR a outgoing connection')
        }

        if (outgoingConnection) {
            this.handshaker = new Handshaker(this.ownPeerDescriptor, this.protocolVersion, outgoingConnection)

            this.handshaker.once('handshakeFailed', (errorMessage) => {
                logger.trace('IL handshake failed for outgoing connection ' + errorMessage + ' ' +
                    this.ownPeerDescriptor.nodeName + ', ' + this.peerDescriptor?.nodeName + ' objectid: ' + this.objectId
                    + ' outputBuffer.length: ' + this.outputBuffer.length)
                this.emit('handshakeFailed')
                //this.destroy()
            })

            this.handshaker.on('handshakeCompleted', (peerDescriptor: PeerDescriptor) => {
                logger.trace('handshake completed for outgoing connection ' + this.ownPeerDescriptor.nodeName +
                    ', ' + this.peerDescriptor?.nodeName + ' objectid: ' + this.objectId
                    + ' outputBuffer.length: ' + this.outputBuffer.length)

                this.attachImplementation(outgoingConnection!)
                this.onHandshakeCompleted(peerDescriptor)
            })

            outgoingConnection.once('connected', () => {
                //this.connectedReceived = true
                //this.attachImplementation(outgoingConnection)
                this.handshaker!.sendHandshakeRequest()
                this.emit('connected')
            })
            outgoingConnection.once('disconnected', this.onDisconnected)

        } else {
            if (incomingConnection) {
                this.handshaker = new Handshaker(this.ownPeerDescriptor, this.protocolVersion, incomingConnection!)
                this.handshaker.on('handshakeRequest', (peerDescriptor: PeerDescriptor) => {
                    this.setPeerDescriptor(peerDescriptor)
                    this.emit('handshakeRequest', peerDescriptor)
                })

                incomingConnection.on('disconnected', this.onDisconnected)

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

    public get peerIdKey(): PeerIDKey {
        return PeerID.fromValue(this.peerDescriptor!.kademliaId).toKey()
    }

    public getLastUsed(): number {
        return this.lastUsed
    }

    public setPeerDescriptor(peerDescriptor: PeerDescriptor): void {
        this.peerDescriptor = peerDescriptor
    }

    public getPeerDescriptor(): PeerDescriptor | undefined {
        return this.peerDescriptor
    }

    private onHandshakeCompleted = (peerDescriptor: PeerDescriptor) => {
        this.lastUsed = Date.now()

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
            this.lastUsed = Date.now()
            if (this.listenerCount('managedData') < 1) {

                this.inputBuffer.push([bytes])
            } else {
                this.emit('managedData', bytes, this.getPeerDescriptor()!)
            }
        })

        impl.on('error', (name: string) => {
            this.emit('error', name)
        })
        impl.on('connected', () => {
            this.lastUsed = Date.now()
            logger.trace('connected emitted')
            this.emit('connected')
        })

        impl.off('disconnected', this.onDisconnected)
        impl.on('disconnected', this.onDisconnected)

        /*
      if (!peerDescriptor) {
          this.handshaker?.run()
      } else {
          this.handshaker?.off('handshakeCompleted', this.onHandshakeCompleted)
          this.onHandshakeCompleted(peerDescriptor)
      }
      */
    }

    private onDisconnected(code?: number, reason?: string): void {
        logger.trace('IL onDisconnected ' + code + ' ' + reason)
        this.doDisconnect()
    }

    async send(data: Uint8Array): Promise<void> {
        this.lastUsed = Date.now()

        if (this.implementation) {
            this.implementation.send(data)
        } else {
            logger.trace('adding data to outputBuffer objectId: ' + this.objectId)
            this.outputBuffer.push(data)

            const result = await raceEvents3<Events>(this, ['handshakeCompleted', 'handshakeFailed',
                'bufferSentByOtherConnection', 'closing', 'disconnected'], 15000)

            if (result.winnerName == 'closing' || result.winnerName == 'disconnected') {
                throw new Err.ConnectionFailed("")
            }

            if (result.winnerName == 'handshakeFailed') {

                this.outgoingConnection!.off('disconnected', this.onDisconnected)

                if (this.bufferSentbyOtherConnection) {
                    logger.trace('bufferSentByOtherConnection already true')
                    this.destroy()
                } else {
                    const result2 = await raceEvents3<Events>(this,
                        ['bufferSentByOtherConnection', 'closing'], 15000)

                    if (result2.winnerName == 'bufferSentByOtherConnection') {
                        logger.trace('bufferSentByOtherConnection received')
                        //this.outgoingConnection!.off('disconnected', lis)
                        this.destroy()
                        //throw new Err.ConnectionFailed()
                    } else if (result2.winnerName == 'closing') {
                        logger.trace('bufferSentByOtherConnection not received, instead received a closing event')
                        //this.outgoingConnection!.off('disconnected', lis)
                        //this.destroy()
                        throw new Err.ConnectionFailed("")
                    }
                }
            }
        }
    }

    public sendNoWait(data: Uint8Array): void {
        this.lastUsed = Date.now()
        if (this.implementation) {
            this.implementation.send(data)
        } else {
            logger.trace('adding data to outputBuffer objectId: ' + this.objectId)
            this.outputBuffer.push(data)
        }
    }

    public reportBufferSentByOtherConnection(): void {
        if (this.handshaker) {
            this.handshaker.removeAllListeners()
        }
        logger.trace('bufferSentByOtherConnection reported')
        this.bufferSentbyOtherConnection = true
        this.emit('bufferSentByOtherConnection')
    }

    public reportBufferSendingByOtherConnectionFailed(): void {
        logger.trace('IL reportBufferSendingByOtherConnectionFailed')
        this.doDisconnect()
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

    private doDisconnect() {
        this.emit('disconnected')
        this.removeAllListeners()
    }

    public async close(): Promise<void> {
        //logger.info('close() ' + this.ownPeerDescriptor.nodeName + ', ' + this.peerDescriptor?.nodeName + ' objectid: ' + this.objectId + ' ')
        this.closing = true
        this.emit('closing')

        if (this.implementation) {
            await this.implementation?.close()
        } else if (this.outgoingConnection) {
            await this.outgoingConnection?.close()
        } else if (this.incomingConnection) {
            await this.incomingConnection?.close()
        } else {
            logger.trace('IL close')
            this.doDisconnect()
        }
    }

    public destroy(): void {
        this.closing = true
        this.emit('closing')
        if (!this.stopped) {
            //logger.info('destroy() ' + this.ownPeerDescriptor.nodeName + ', ' + this.peerDescriptor?.nodeName + ' objectid: ' + this.objectId + ' ')
            this.stopped = true

            this.removeAllListeners()
            if (this.implementation) {
                this.implementation?.destroy()
            } else if (this.outgoingConnection) {
                this.outgoingConnection?.destroy()
            } else if (this.incomingConnection) {
                this.incomingConnection?.destroy()
            }
        }
    }

    isHandshakeCompleted(): boolean {
        return this.handshakeCompleted
    }

    stealOutputBuffer(): Uint8Array[] {
        const ret = this.outputBuffer
        this.outputBuffer = []
        return ret
    }
}

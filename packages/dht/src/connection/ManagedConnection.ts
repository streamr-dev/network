import { ConnectionEvents, ConnectionID, ConnectionType, IConnection } from "./IConnection"
import * as Err from '../helpers/errors'
import { Handshaker } from "./Handshaker"
import { PeerDescriptor } from "../proto/packages/dht/protos/DhtRpc"
import { Logger, raceEvents3, runAndRaceEvents3, RunAndRaceEventsReturnType } from "@streamr/utils"
import EventEmitter from "eventemitter3"
import { PeerIDKey } from "../helpers/PeerID"
import { keyFromPeerDescriptor } from '../helpers/peerIdFromPeerDescriptor'
import { DisconnectionType } from "../transport/ITransport"

export interface ManagedConnectionEvents {
    managedData: (bytes: Uint8Array, remotePeerDescriptor: PeerDescriptor) => void
    handshakeRequest: (peerDescriptor: PeerDescriptor) => void
    handshakeCompleted: (peerDescriptor: PeerDescriptor) => void
    handshakeFailed: () => void
    bufferSentByOtherConnection: () => void
    closing: () => void
    internal_disconnected: () => void
}

const logger = new Logger(module)

export type Events = ManagedConnectionEvents & ConnectionEvents
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
    private ownPeerDescriptor: PeerDescriptor
    private protocolVersion: string
    protected outgoingConnection?: IConnection
    protected incomingConnection?: IConnection

    constructor(
        ownPeerDescriptor: PeerDescriptor,
        protocolVersion: string,
        connectionType: ConnectionType,
        outgoingConnection?: IConnection,
        incomingConnection?: IConnection,
    ) {
        super()
        this.objectId = ManagedConnection.objectCounter
        ManagedConnection.objectCounter++

        this.send = this.send.bind(this)

        this.ownPeerDescriptor = ownPeerDescriptor
        this.protocolVersion = protocolVersion
        this.outgoingConnection = outgoingConnection
        this.incomingConnection = incomingConnection
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
                logger.info(' ' + this.ownPeerDescriptor.nodeName + ', ' + this.peerDescriptor?.nodeName + ' emitting handshakeFailed')
                this.emit('handshakeFailed')
            })

            this.handshaker.on('handshakeCompleted', (peerDescriptor: PeerDescriptor) => {
                logger.trace('handshake completed for outgoing connection ' + this.ownPeerDescriptor.nodeName +
                    ', ' + this.peerDescriptor?.nodeName + ' objectid: ' + this.objectId
                    + ' outputBuffer.length: ' + this.outputBuffer.length)

                this.attachImplementation(outgoingConnection!)
                this.onHandshakeCompleted(peerDescriptor)
            })

            outgoingConnection.once('connected', () => {
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
        return keyFromPeerDescriptor(this.peerDescriptor!)
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

    }

    private doNotEmitDisconnected = false
    private disconnectReceived = false

    private onDisconnected(disconnectionType: DisconnectionType, _code?: number, _reason?: string): void {

        this.disconnectReceived = true
        logger.trace(' ' + this.ownPeerDescriptor.nodeName + ', ' + this.peerDescriptor?.nodeName + ' onDisconnected() ' + disconnectionType)
        if (this.bufferSentbyOtherConnection) {
            //logger.error('onDisconnected called on replaced connection')
            return
        }

        this.emit('internal_disconnected')

        this.doDisconnect(disconnectionType)

    }

    private sendCallCounter = 0
    async send(data: Uint8Array, doNotConnect = false): Promise<void> {
        const counter = this.sendCallCounter
        this.sendCallCounter++
        if (this.stopped) {
            logger.error('send() called on stopped connection')
            return
        }

        if (this.closing) {
            logger.error('send() called on closing connection')
            return
        }

        this.lastUsed = Date.now()

        if (doNotConnect && !this.implementation) {
            throw new Err.ConnectionNotOpen('Connection not open when calling send() with doNotConnect flag')
        } else if (this.implementation) {
            this.implementation.send(data)
        } else {
            logger.trace('adding data to outputBuffer objectId: ' + this.objectId)

            let result: RunAndRaceEventsReturnType<Events>

            //this.outgoingConnection!.off('disconnected', this.onDisconnected)
            this.doNotEmitDisconnected = true

            try {
                result = await runAndRaceEvents3<Events>([() => { this.outputBuffer.push(data) }], this, ['handshakeCompleted', 'handshakeFailed',
                    'bufferSentByOtherConnection', 'closing', 'internal_disconnected'], 15000)
            } catch (e) {
                logger.error('Exception from raceEvents3 ' + counter + ' error: ' + e)
                //const dataString = protoToString(Message.fromBinary(data), Message)
                throw e
            }

            if (result.winnerName == 'internal_disconnected') {
                this.doNotEmitDisconnected = false
                this.doDisconnect('OTHER')
                //throw new Err.ConnectionFailed("Disconnected before send")
            } else if (result.winnerName == 'handshakeFailed') {
                logger.info(' ' + this.ownPeerDescriptor.nodeName + ', ' + this.peerDescriptor?.nodeName 
                    + ' handshakeFailed received ' + this.connectionId + " " + counter)

                if (this.bufferSentbyOtherConnection) {
                    logger.trace('bufferSentByOtherConnection already true')
                    //this.destroy()
                    this.doNotEmitDisconnected = false
                    this.doDisconnect('OTHER')
                } else {
                    let result2: RunAndRaceEventsReturnType<Events>

                    try {
                        result2 = await raceEvents3<Events>(this,
                            ['bufferSentByOtherConnection', 'closing', 'disconnected'], 15000)
                    } catch (ex) {
                        logger.error(' ' + this.ownPeerDescriptor.nodeName + ', ' + this.peerDescriptor?.nodeName 
                            + ' Exception from raceEvents3 while waiting bufferSentByOtherConnection or closing ' 
                            + this.connectionId + " " + counter + " " + ex)
                        logger.info(this.connectionId + ' Exception from raceEvents3 while waiting bufferSentByOtherConnection ' + counter)
                        //const dataString = protoToString(Message.fromBinary(data), Message)
                        throw ex
                    }
                    if (result2.winnerName == 'bufferSentByOtherConnection') {
                        logger.trace('bufferSentByOtherConnection received')
                        //this.destroy()
                        this.doNotEmitDisconnected = false
                        this.doDisconnect('OTHER')
                    } else if (result2.winnerName == 'closing') {
                        logger.trace('bufferSentByOtherConnection not received, instead received a closing event')
                        //throw new Err.ConnectionFailed("Closing before buffer sent by duplicate onnection")
                    } else if (result2.winnerName == 'disconnected') {
                        logger.trace('disconnected while in raceEvents3')
                        //throw new Err.ConnectionFailed("Closing before buffer sent by duplicate onnection")
                    }
                }
            }
            this.doNotEmitDisconnected = false
            if (this.disconnectReceived) {
                this.doDisconnect('OTHER')
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
        logger.info(' ' + this.ownPeerDescriptor.nodeName + ', ' + this.peerDescriptor?.nodeName 
            + " reportBufferSentByOtherConnection " + this.connectionId)
        if (this.handshaker) {
            this.handshaker.removeAllListeners()
        }
        logger.trace('bufferSentByOtherConnection reported')
        this.bufferSentbyOtherConnection = true
        this.emit('bufferSentByOtherConnection')
    }

    public reportBufferSendingByOtherConnectionFailed(): void {
        logger.info('reportBufferSendingByOtherConnectionFailed')
        this.doDisconnect('OTHER')
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

    private doDisconnect(disconnectionType: DisconnectionType) {
        logger.trace(' ' + this.ownPeerDescriptor.nodeName + ', ' + this.peerDescriptor?.nodeName + ' doDisconnect() emitting')

        if (!this.doNotEmitDisconnected) {
            logger.info(' ' + this.ownPeerDescriptor.nodeName + ', ' + this.peerDescriptor?.nodeName + ' emitting disconnected ' + this.connectionId)
            this.emit('disconnected', disconnectionType)
        } else {
            logger.info(' ' + this.ownPeerDescriptor.nodeName + ', ' + this.peerDescriptor?.nodeName +
                ' not emitting disconnected because doNotEmitDisconnected flag is set')
        }
    }

    public async close(disconnectionType: DisconnectionType): Promise<void> {
        if (this.replacedByOtherConnection) {
            logger.trace('close() called on replaced connection')
        }
        this.closing = true
        this.emit('closing')
        this.doNotEmitDisconnected = false
        if (this.implementation) {
            logger.trace(' ' + this.ownPeerDescriptor.nodeName + ', ' + this.peerDescriptor?.nodeName + ' calling close() implmentation')
            await this.implementation?.close(disconnectionType)
            logger.trace(' ' + this.ownPeerDescriptor.nodeName + ', ' + this.peerDescriptor?.nodeName + ' called close() implmentation')
        } else if (this.outgoingConnection) {
            logger.trace(' ' + this.ownPeerDescriptor.nodeName + ', ' + this.peerDescriptor?.nodeName + ' calling close() outgoingconnection')
            await this.outgoingConnection?.close(disconnectionType)
            logger.trace(' ' + this.ownPeerDescriptor.nodeName + ', ' + this.peerDescriptor?.nodeName + ' called close() outgoingconnection')
        } else if (this.incomingConnection) {
            logger.trace(' ' + this.ownPeerDescriptor.nodeName + ', ' + this.peerDescriptor?.nodeName + ' calling close() incomingconnection')
            await this.incomingConnection?.close(disconnectionType)
            logger.trace(' ' + this.ownPeerDescriptor.nodeName + ', ' + this.peerDescriptor?.nodeName + ' called close() implmentation')
        } else {
            logger.trace(' ' + this.ownPeerDescriptor.nodeName + ', ' + this.peerDescriptor?.nodeName + ' close() not called')
            logger.trace('IL close')
            this.doDisconnect(disconnectionType)
        }
    }

    public destroy(): void {
        this.closing = true
        this.emit('closing')
        if (!this.stopped) {
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

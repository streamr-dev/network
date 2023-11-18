import { ConnectionEvents, ConnectionID, ConnectionType, IConnection } from './IConnection'
import * as Err from '../helpers/errors'
import { Handshaker } from './Handshaker'
import { PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'
import { Logger, raceEvents3, runAndRaceEvents3, RunAndRaceEventsReturnType } from '@streamr/utils'
import EventEmitter from 'eventemitter3'
import { PeerIDKey } from '../helpers/PeerID'
import { keyFromPeerDescriptor } from '../helpers/peerIdFromPeerDescriptor'
import { keyOrUnknownFromPeerDescriptor } from './ConnectionManager'

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

    private implementation?: IConnection

    private outputBuffer: Uint8Array[] = []
    private inputBuffer: Uint8Array[] = []

    public connectionId: ConnectionID
    private peerDescriptor?: PeerDescriptor
    public connectionType: ConnectionType

    private handshaker?: Handshaker
    private handshakeCompleted = false
    private emitDisconnected = true

    private lastUsed: number = Date.now()
    private stopped = false
    public disconnected = false
    public offeredAsIncoming = false
    private bufferSentbyOtherConnection = false
    private closing = false
    public replacedByOtherConnection = false
    private firstSend = true
    private localPeerDescriptor: PeerDescriptor
    protected outgoingConnection?: IConnection
    protected incomingConnection?: IConnection

    constructor(
        localPeerDescriptor: PeerDescriptor,
        connectionType: ConnectionType,
        outgoingConnection?: IConnection,
        incomingConnection?: IConnection,
    ) {
        super()

        this.send = this.send.bind(this)

        this.localPeerDescriptor = localPeerDescriptor
        this.outgoingConnection = outgoingConnection
        this.incomingConnection = incomingConnection
        this.connectionType = connectionType
        this.connectionId = new ConnectionID()

        this.onDisconnected = this.onDisconnected.bind(this)

        logger.trace('creating ManagedConnection of type: ' + connectionType)
        if (incomingConnection && outgoingConnection) {
            throw new Err.IllegalArguments('Managed connection constructor only accepts either an incoming connection OR a outgoing connection')
        }

        if (outgoingConnection) {
            this.handshaker = new Handshaker(this.localPeerDescriptor, outgoingConnection)

            this.handshaker.once('handshakeFailed', (errorMessage) => {
                logger.trace(keyOrUnknownFromPeerDescriptor(this.peerDescriptor) + ' handshakeFailed: ' + errorMessage)
                this.emit('handshakeFailed')
            })

            this.handshaker.on('handshakeCompleted', (peerDescriptor: PeerDescriptor) => {
                logger.trace('handshake completed for outgoing connection '
                    + ', ' + keyOrUnknownFromPeerDescriptor(this.peerDescriptor) 
                    + ' outputBuffer.length: ' + this.outputBuffer.length)
                this.attachImplementation(outgoingConnection)
                this.onHandshakeCompleted(peerDescriptor)
            })

            outgoingConnection.once('connected', () => {
                this.handshaker!.sendHandshakeRequest()
                this.emit('connected')
            })
            outgoingConnection.once('disconnected', this.onDisconnected)
            outgoingConnection.once('error', (error) => {
                this.emitDisconnected = true
                this.emit('error', error)
            })

        } else {
            if (incomingConnection) {
                this.handshaker = new Handshaker(this.localPeerDescriptor, incomingConnection)
                this.handshaker.on('handshakeRequest', (peerDescriptor: PeerDescriptor) => {
                    this.setPeerDescriptor(peerDescriptor)
                    this.emit('handshakeRequest', peerDescriptor)
                })

                incomingConnection.on('disconnected', this.onDisconnected)
                incomingConnection.once('error', (error) => {
                    this.emitDisconnected = true
                    this.emit('error', error)
                })
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
        if (event === 'managedData' && this.listenerCount('managedData') === 0) {
            while (this.inputBuffer.length > 0) {
                logger.trace('emptying inputBuffer')
                const data = this.inputBuffer.shift()!
                fn(data, this.getPeerDescriptor())
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
        if (event === 'managedData' && this.listenerCount('managedData') === 0) {
            if (this.inputBuffer.length > 0) {
                while (this.inputBuffer.length > 0) {
                    logger.trace('emptying inputBuffer')
                    const data = this.inputBuffer.shift()!
                    fn(data, this.getPeerDescriptor())
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

    private onHandshakeCompleted(peerDescriptor: PeerDescriptor) {
        this.lastUsed = Date.now()

        this.setPeerDescriptor(peerDescriptor)
        this.handshakeCompleted = true

        while (this.outputBuffer.length > 0) {
            logger.trace('emptying outputBuffer')
            this.implementation!.send(this.outputBuffer.shift()!)
        }

        logger.trace('emitting handshake_completed')
        this.emit('handshakeCompleted', peerDescriptor)
    }

    public attachImplementation(impl: IConnection): void {
        logger.trace('attachImplementation()')
        this.implementation = impl

        impl.on('data', (bytes: Uint8Array) => {
            this.lastUsed = Date.now()
            if (this.listenerCount('managedData') === 0) {

                this.inputBuffer.push(bytes)
            } else {
                this.emit('managedData', bytes, this.getPeerDescriptor()!)
            }
        })
        impl.on('connected', () => {
            this.lastUsed = Date.now()
            logger.trace('connected emitted')
            this.emit('connected')
        })

        impl.off('disconnected', this.onDisconnected)
        impl.on('disconnected', this.onDisconnected)
    }

    private onDisconnected(gracefulLeave: boolean): void {
        logger.trace(keyOrUnknownFromPeerDescriptor(this.peerDescriptor) + ' onDisconnected() ' + gracefulLeave)
        if (this.bufferSentbyOtherConnection) {
            return
        }
        this.emit('internal_disconnected')
        this.doDisconnect(gracefulLeave)
    }

    async send(data: Uint8Array, doNotConnect = false): Promise<void> {
        if (this.stopped) {
            return
        }
        if (this.closing) {
            return
        }
        this.lastUsed = Date.now()

        if (doNotConnect && !this.implementation) {
            throw new Err.ConnectionNotOpen('Connection not open when calling send() with doNotConnect flag')
        } else if (this.implementation) {
            this.implementation.send(data)
        } else {
            logger.trace('adding data to outputBuffer')

            let result: RunAndRaceEventsReturnType<Events>
            if (this.firstSend) {
                this.emitDisconnected = false
                this.firstSend = false
            }
            try {
                result = await runAndRaceEvents3<Events>([() => { this.outputBuffer.push(data) }], this, ['handshakeCompleted', 'handshakeFailed',
                    'bufferSentByOtherConnection', 'closing', 'internal_disconnected'], 15000)
            } catch (e) {
                logger.debug(`Connection to ${keyOrUnknownFromPeerDescriptor(this.peerDescriptor)} timed out`)
                this.emitDisconnected = true
                throw e
            }

            if (result.winnerName === 'internal_disconnected') {
                this.emitDisconnected = true
                this.doDisconnect(false)
                throw new Error(`Disconnected opening connection of type ${this.connectionType}`)
            } else if (result.winnerName === 'handshakeFailed') {
                logger.debug(keyOrUnknownFromPeerDescriptor(this.peerDescriptor) + ' handshakeFailed received')

                if (this.bufferSentbyOtherConnection) {
                    logger.trace('bufferSentByOtherConnection already true')
                    this.emitDisconnected = true
                    this.doDisconnect(false)
                } else {
                    let result2: RunAndRaceEventsReturnType<Events>

                    try {
                        result2 = await raceEvents3<Events>(this,
                            ['bufferSentByOtherConnection', 'closing', 'disconnected'], 15000)
                    } catch (ex) {
                        this.emitDisconnected = true
                        this.doDisconnect(false)
                        logger.trace(keyOrUnknownFromPeerDescriptor(this.peerDescriptor)
                            + ' Exception from raceEvents3 while waiting bufferSentByOtherConnection or closing ' + ex)
                        throw ex
                    }
                    if (result2.winnerName === 'bufferSentByOtherConnection') {
                        logger.trace('bufferSentByOtherConnection received')
                        this.emitDisconnected = true
                        this.doDisconnect(false)
                    } else if (result2.winnerName === 'closing') {
                        logger.trace('bufferSentByOtherConnection not received, instead received a closing event')
                    } else if (result2.winnerName === 'disconnected') {
                        logger.trace('disconnected while in raceEvents3')
                    }
                }
            } else {
                this.emitDisconnected = true
            }
        }
    }

    public sendNoWait(data: Uint8Array): void {
        this.lastUsed = Date.now()
        if (this.implementation) {
            this.implementation.send(data)
        } else {
            logger.trace('adding data to outputBuffer')
            this.outputBuffer.push(data)
        }
    }

    public reportBufferSentByOtherConnection(): void {
        logger.trace(keyOrUnknownFromPeerDescriptor(this.peerDescriptor) + ' reportBufferSentByOtherConnection')
        if (this.handshaker) {
            this.handshaker.removeAllListeners()
        }
        logger.trace('bufferSentByOtherConnection reported')
        this.bufferSentbyOtherConnection = true
        this.emit('bufferSentByOtherConnection')
    }

    public acceptHandshake(): void {
        // This happens when connectionRequest has been made and answered
        if (this.implementation) {
            if (!this.handshaker) {
                this.handshaker = new Handshaker(this.localPeerDescriptor, this.implementation)
            }

            this.handshaker.sendHandshakeResponse()

        } else {  // This happens to when there is a regular incoming connection
            this.handshaker!.sendHandshakeResponse()
            this.attachImplementation(this.incomingConnection!)
        }

        this.onHandshakeCompleted(this.peerDescriptor!)
    }

    public rejectHandshake(errorMessage: string): void {
        this.handshaker!.sendHandshakeResponse(errorMessage)
    }

    private doDisconnect(gracefulLeave: boolean) {
        logger.trace(keyOrUnknownFromPeerDescriptor(this.peerDescriptor) + ' doDisconnect() emitting')

        if (this.emitDisconnected) {
            logger.trace(keyOrUnknownFromPeerDescriptor(this.peerDescriptor) + ' emitting disconnected')
            this.disconnected = true
            this.emit('disconnected', gracefulLeave)
        } else {
            logger.trace(keyOrUnknownFromPeerDescriptor(this.peerDescriptor) + ' not emitting disconnected because emitDisconnected flag is false')
        }
    }

    public async close(gracefulLeave: boolean): Promise<void> {
        if (this.replacedByOtherConnection) {
            logger.trace('close() called on replaced connection')
        }
        this.closing = true
        this.emit('closing')
        this.emitDisconnected = true
        if (this.implementation) {
            await this.implementation?.close(gracefulLeave)
        } else if (this.outgoingConnection) {
            await this.outgoingConnection?.close(gracefulLeave)
        } else if (this.incomingConnection) {
            await this.incomingConnection?.close(gracefulLeave)
        } else {
            this.doDisconnect(gracefulLeave)
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

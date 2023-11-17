import { ConnectionEvents, ConnectionID, ConnectionType, IConnection } from './IConnection'
import * as Err from '../helpers/errors'
import { Handshaker } from './Handshaker'
import { HandshakeError, PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'
import { Logger, raceEvents3, runAndRaceEvents3, RunAndRaceEventsReturnType } from '@streamr/utils'
import EventEmitter from 'eventemitter3'
import { PeerIDKey } from '../helpers/PeerID'
import { keyFromPeerDescriptor } from '../helpers/peerIdFromPeerDescriptor'
import { keyOrUnknownFromPeerDescriptor } from './ConnectionManager'

export interface ManagedConnectionEvents {
    managedData: (bytes: Uint8Array, remotePeerDescriptor: PeerDescriptor) => void
    handshakeRequest: (source: PeerDescriptor, target?: PeerDescriptor) => void
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
    private remotePeerDescriptor?: PeerDescriptor
    public connectionType: ConnectionType

    private handshaker?: Handshaker
    private handshakeCompleted = false
    private doNotEmitDisconnected = false

    private lastUsed: number = Date.now()
    private stopped = false
    public offeredAsIncoming = false
    private bufferSentbyOtherConnection = false
    private closing = false
    public replacedByOtherConnection = false
    private localPeerDescriptor: PeerDescriptor
    protected outgoingConnection?: IConnection
    protected incomingConnection?: IConnection

    constructor(
        localPeerDescriptor: PeerDescriptor,
        connectionType: ConnectionType,
        outgoingConnection?: IConnection,
        incomingConnection?: IConnection,
        targetPeerDescriptor?: PeerDescriptor
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

            this.handshaker.once('handshakeFailed', (error) => {
                if (error === HandshakeError.INVALID_TARGET_PEER_DESCRIPTOR) {
                    this.destroy()
                } else {
                    logger.trace(keyOrUnknownFromPeerDescriptor(this.remotePeerDescriptor) + ' handshakeFailed: ' + error)
                    this.emit('handshakeFailed')
                }
            })

            this.handshaker.on('handshakeCompleted', (peerDescriptor: PeerDescriptor) => {
                logger.trace('handshake completed for outgoing connection '
                    + ', ' + keyOrUnknownFromPeerDescriptor(this.remotePeerDescriptor) 
                    + ' outputBuffer.length: ' + this.outputBuffer.length)
                this.attachImplementation(outgoingConnection)
                this.onHandshakeCompleted(peerDescriptor)
            })

            outgoingConnection.once('connected', () => {
                this.handshaker!.sendHandshakeRequest(targetPeerDescriptor)
                this.emit('connected')
            })
            outgoingConnection.once('disconnected', this.onDisconnected)

        } else {
            if (incomingConnection) {
                this.handshaker = new Handshaker(this.localPeerDescriptor, incomingConnection)
                this.handshaker.on('handshakeRequest', (sourcePeerDescriptor: PeerDescriptor, targetPeerDescriptor?: PeerDescriptor) => {
                    this.setRemotePeerDescriptor(sourcePeerDescriptor)
                    this.emit('handshakeRequest', sourcePeerDescriptor, targetPeerDescriptor)
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
        return keyFromPeerDescriptor(this.remotePeerDescriptor!)
    }

    public getLastUsed(): number {
        return this.lastUsed
    }

    public setRemotePeerDescriptor(peerDescriptor: PeerDescriptor): void {
        this.remotePeerDescriptor = peerDescriptor
    }

    public getPeerDescriptor(): PeerDescriptor | undefined {
        return this.remotePeerDescriptor
    }

    private onHandshakeCompleted(peerDescriptor: PeerDescriptor) {
        this.lastUsed = Date.now()

        this.setRemotePeerDescriptor(peerDescriptor)
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

    private onDisconnected(gracefulLeave: boolean): void {
        logger.trace(keyOrUnknownFromPeerDescriptor(this.remotePeerDescriptor) + ' onDisconnected() ' + gracefulLeave)
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

            this.doNotEmitDisconnected = true

            try {
                result = await runAndRaceEvents3<Events>([() => { this.outputBuffer.push(data) }], this, ['handshakeCompleted', 'handshakeFailed',
                    'bufferSentByOtherConnection', 'closing', 'internal_disconnected'], 15000)
            } catch (e) {
                logger.debug(`Connection to ${keyOrUnknownFromPeerDescriptor(this.remotePeerDescriptor)} timed out`)
                throw e
            }

            if (result.winnerName === 'internal_disconnected') {
                this.doNotEmitDisconnected = false
                this.doDisconnect(false)
            } else if (result.winnerName === 'handshakeFailed') {
                logger.trace(keyOrUnknownFromPeerDescriptor(this.remotePeerDescriptor) + ' handshakeFailed received')

                if (this.bufferSentbyOtherConnection) {
                    logger.trace('bufferSentByOtherConnection already true')
                    this.doNotEmitDisconnected = false
                    this.doDisconnect(false)
                } else {
                    let result2: RunAndRaceEventsReturnType<Events>

                    try {
                        result2 = await raceEvents3<Events>(this,
                            ['bufferSentByOtherConnection', 'closing', 'disconnected'], 15000)
                    } catch (ex) {
                        logger.trace(keyOrUnknownFromPeerDescriptor(this.remotePeerDescriptor)
                            + ' Exception from raceEvents3 while waiting bufferSentByOtherConnection or closing ' + ex)
                        throw ex
                    }
                    if (result2.winnerName === 'bufferSentByOtherConnection') {
                        logger.trace('bufferSentByOtherConnection received')
                        this.doNotEmitDisconnected = false
                        this.doDisconnect(false)
                    } else if (result2.winnerName === 'closing') {
                        logger.trace('bufferSentByOtherConnection not received, instead received a closing event')
                    } else if (result2.winnerName === 'disconnected') {
                        logger.trace('disconnected while in raceEvents3')
                    }
                }
            } else {
                this.doNotEmitDisconnected = false
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
        logger.trace(keyOrUnknownFromPeerDescriptor(this.remotePeerDescriptor) + ' reportBufferSentByOtherConnection')
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

        this.onHandshakeCompleted(this.remotePeerDescriptor!)
    }

    public rejectHandshake(error: HandshakeError): void {
        this.handshaker!.sendHandshakeResponse(error)
    }

    private doDisconnect(gracefulLeave: boolean) {
        logger.trace(keyOrUnknownFromPeerDescriptor(this.remotePeerDescriptor) + ' doDisconnect() emitting')

        if (!this.doNotEmitDisconnected) {
            logger.trace(keyOrUnknownFromPeerDescriptor(this.remotePeerDescriptor) + ' emitting disconnected')
            this.emit('disconnected', gracefulLeave)
        } else {
            // eslint-disable-next-line max-len
            logger.trace(keyOrUnknownFromPeerDescriptor(this.remotePeerDescriptor) + ' not emitting disconnected because doNotEmitDisconnected flag is set')
        }
    }

    public async close(gracefulLeave: boolean): Promise<void> {
        if (this.replacedByOtherConnection) {
            logger.trace('close() called on replaced connection')
        }
        this.closing = true
        this.emit('closing')
        this.doNotEmitDisconnected = false
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

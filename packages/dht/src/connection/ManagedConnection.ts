import { ConnectionEvents, ConnectionID, ConnectionType, IConnection } from './IConnection'
import * as Err from '../helpers/errors'
import { Handshaker } from './Handshaker'
import { PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'
import { Logger, runAndRaceEvents3, RunAndRaceEventsReturnType } from '@streamr/utils'
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
}

interface OutpuBufferEvents {
    bufferSent: () => void
    bufferSendingFailed: () => void
}

const logger = new Logger(module)

export type Events = ManagedConnectionEvents & ConnectionEvents

export class ManagedConnection extends EventEmitter<Events> {

    private implementation?: IConnection

    private outputBufferEmitter = new EventEmitter<OutpuBufferEvents>()
    private outputBuffer: Uint8Array[] = []

    private inputBuffer: Uint8Array[] = []

    public connectionId: ConnectionID
    private peerDescriptor?: PeerDescriptor
    public connectionType: ConnectionType

    private handshaker?: Handshaker
    private handshakeCompleted = false
    public disconnected = false

    private lastUsed: number = Date.now()
    private stopped = false
    public offeredAsIncoming = false
    public rejectedAsIncoming = false
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
    ) {
        super()

        this.localPeerDescriptor = localPeerDescriptor
        this.outgoingConnection = outgoingConnection
        this.incomingConnection = incomingConnection
        this.connectionType = connectionType
        this.connectionId = new ConnectionID()

        this.send = this.send.bind(this)
        this.onDisconnected = this.onDisconnected.bind(this)

        logger.trace('creating ManagedConnection of type: ' + connectionType)
        if (incomingConnection && outgoingConnection) {
            throw new Err.IllegalArguments('Managed connection constructor only accepts either an incoming connection OR a outgoing connection')
        }

        if (outgoingConnection) {
            outgoingConnection.setManagedConnection(this)
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

        } else {
            if (incomingConnection) {
                incomingConnection.setManagedConnection(this)
                this.handshaker = new Handshaker(this.localPeerDescriptor, incomingConnection)
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
        this.outputBufferEmitter.emit('bufferSent')
        logger.trace('emitting handshake_completed')
        this.emit('handshakeCompleted', peerDescriptor)
    }

    public attachImplementation(impl: IConnection): void {
        logger.trace('attachImplementation()')
        impl.setManagedConnection(this)
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

        //ensure that we have subscribed to the event only once
        impl.off('disconnected', this.onDisconnected)
        impl.on('disconnected', this.onDisconnected)
    }

    private onDisconnected(gracefulLeave: boolean): void {
        logger.trace(keyOrUnknownFromPeerDescriptor(this.peerDescriptor) + ' onDisconnected() ' + gracefulLeave)
        if (this.bufferSentbyOtherConnection) {
            return
        }
        this.outputBufferEmitter.emit('bufferSendingFailed')
        this.disconnected = true
        this.emit('disconnected', gracefulLeave)
    }

    async send(data: Uint8Array, doNotConnect = false): Promise<void> {
        if (this.stopped) {
            throw new Err.SendFailed('ManagedConnection is stopped')
        }
        if (this.closing) {
            throw new Err.SendFailed('ManagedConnection is closing')
        }
        this.lastUsed = Date.now()

        if (doNotConnect && !this.implementation) {
            throw new Err.ConnectionNotOpen('Connection not open when calling send() with doNotConnect flag')
        } else if (this.implementation) {
            this.implementation.send(data)
        } else {
            logger.trace('adding data to outputBuffer')

            let result: RunAndRaceEventsReturnType<OutpuBufferEvents>

            try {
                result = await runAndRaceEvents3<OutpuBufferEvents>([() => { this.outputBuffer.push(data) }],
                    this.outputBufferEmitter, ['bufferSent', 'bufferSendingFailed'], 15000)
            } catch (e) {
                logger.debug(`Connection to ${keyOrUnknownFromPeerDescriptor(this.peerDescriptor)} timed out`)
                throw new Err.SendFailed('Sending buffer timed out')
            }

            if (result.winnerName === 'bufferSendingFailed') {
                throw new Err.SendFailed('Sending buffer failed')
            }
            // buffer was sent successfully, return normally
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
        this.outputBufferEmitter.emit('bufferSent')
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

    public async close(gracefulLeave: boolean): Promise<void> {
        if (this.replacedByOtherConnection) {
            logger.trace('close() called on replaced connection')
        }
        this.closing = true
        
        this.outputBufferEmitter.emit('bufferSendingFailed')
        this.emit('closing')
       
        if (this.implementation) {
            await this.implementation?.close(gracefulLeave)
        } else if (this.outgoingConnection) {
            await this.outgoingConnection?.close(gracefulLeave)
        } else if (this.incomingConnection) {
            await this.incomingConnection?.close(gracefulLeave)
        } else {
            this.emit('disconnected', gracefulLeave)
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

    public toString(): string {
        const ret = 'ManagedConnection \n'
            + 'connectionId: ' + this.connectionId.toString() + '\n'
            + 'peerDescriptor: ' + JSON.stringify(this.peerDescriptor) + '\n'
            + 'connectionType: ' + this.connectionType + '\n'
            + 'handshakeCompleted: ' + this.handshakeCompleted + '\n'
            + 'stopped: ' + this.stopped + '\n'
            + 'offeredAsIncoming: ' + this.offeredAsIncoming + '\n'
            + 'rejectedAsIncoming: ' + this.rejectedAsIncoming + '\n'
            + 'bufferSentbyOtherConnection: ' + this.bufferSentbyOtherConnection + '\n'
            + 'closing: ' + this.closing + '\n'
            + 'replacedByOtherConnection: ' + this.replacedByOtherConnection + '\n'
            + 'localPeerDescriptor: ' + JSON.stringify(this.localPeerDescriptor) + '\n'
            + 'hasOutgoingConnection: ' + (this.outgoingConnection ? 'true' : 'false') + '\n'
            + 'hasIncomingConnection: ' + (this.incomingConnection ? 'true' : 'false') + '\n'
            + 'hasImplementation: ' + (this.implementation ? 'true' : 'false') + '\n'
            + 'outputBuffer.length: ' + this.outputBuffer.length + '\n'
            + 'inputBuffer.length: ' + this.inputBuffer.length + '\n'
            + 'lastUsed: ' + this.lastUsed + '\n'
            + 'hasHandshaker: ' + (this.handshaker ? 'true' : 'false') + '\n'

        return ret
    }
}

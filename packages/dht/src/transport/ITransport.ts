import { Message, PeerDescriptor } from '../../generated/packages/dht/protos/DhtRpc'
import { EventEmitterType } from '@streamr/utils'

export interface TransportEvents {
    connected: (peerDescriptor: PeerDescriptor) => void
    disconnected: (peerDescriptor: PeerDescriptor, gracefulLeave: boolean) => void
    message: (message: Message) => void
}

export interface SendOptions {
    connect: boolean
    sendIfStopped: boolean
    doNotBufferWhileConnecting: boolean
}

export const DEFAULT_SEND_OPTIONS = {
    connect: true,
    sendIfStopped: false,
    doNotBufferWhileConnecting: false
}

export interface ITransport extends EventEmitterType<TransportEvents> {
    send(msg: Message, opts?: SendOptions): Promise<void>
    getLocalPeerDescriptor(): PeerDescriptor
    stop(): void | Promise<void>
    getDiagnosticInfo(): Record<string, unknown>
}

import { Message, PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'
import { EmitterOf } from '@streamr/utils'
export interface TransportEvents {
    connected: (peerDescriptor: PeerDescriptor) => void
    disconnected: (peerDescriptor: PeerDescriptor, gracefulLeave: boolean) => void
    message: (message: Message) => void
}

export interface SendOptions {
    connect: boolean
    sendIfStopped: boolean
}

export const DEFAULT_SEND_OPTIONS = {
    connect: true,
    sendIfStopped: false
}

export interface ITransport extends EmitterOf<TransportEvents> {
    send(msg: Message, opts?: SendOptions): Promise<void>
    getLocalPeerDescriptor(): PeerDescriptor
    stop(): void | Promise<void>
}

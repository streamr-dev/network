import { PeerDescriptor, RouteMessageType } from '../proto/DhtRpc'

export interface RouteMessageParams {
    message: Uint8Array
    destinationPeer: PeerDescriptor
    sourcePeer: PeerDescriptor
    messageType: RouteMessageType
    previousPeer?: PeerDescriptor
    messageId?: string
}

export enum Event {
    DATA = 'streamr:dht-node:layer-0:message-router:on-data'
}

export interface IMessageRouter {
    on(event: Event.DATA, listener: (peerDescriptor: PeerDescriptor, messageType: RouteMessageType, bytes: Uint8Array) => void): this
    routeMessage(params: RouteMessageParams): void
}
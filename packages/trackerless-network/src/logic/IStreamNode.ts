import { PeerIDKey } from "@streamr/dht"
import { ProxyDirection, StreamMessage } from "../proto/packages/trackerless-network/protos/NetworkRpc"

export interface IStreamNode {
        
    on(event: 'message', listener: (message: StreamMessage) => void): this

    once(event: 'message', listener: (message: StreamMessage) => void): this

    off(event: 'message', listener: (message: StreamMessage) => void): void

    broadcast(msg: StreamMessage, previousPeer?: string): void
    hasProxyConnection(peerKey: PeerIDKey, direction: ProxyDirection): boolean
    stop(): void
    start(): Promise<void>
    getTargetNeighborStringIds(): string[]
}

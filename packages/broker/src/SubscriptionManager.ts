import { NetworkNode, Protocol } from 'streamr-network'

export class SubscriptionManager {
    streams = new Map<Protocol.SPIDKey, number>()

    constructor(public networkNode: NetworkNode) {
    }

    subscribe(streamId: string, streamPartition = 0): void {
        const key = Protocol.SPID.toKey(streamId, streamPartition)
        this.streams.set(key, this.streams.get(key) || 0)
        this.networkNode.subscribe(streamId, streamPartition)
    }

    unsubscribe(streamId: string, streamPartition = 0): void {
        const key = Protocol.SPID.toKey(streamId, streamPartition)
        this.streams.set(key, (this.streams.get(key) || 0) - 1)

        if ((this.streams.get(key) || 0) <= 0) {
            this.streams.delete(key)

            this.networkNode.unsubscribe(streamId, streamPartition)
        }
    }
}

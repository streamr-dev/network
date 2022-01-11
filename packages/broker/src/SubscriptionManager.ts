import { NetworkNode, Protocol } from 'streamr-network'
import { SPID } from 'streamr-client-protocol'

export class SubscriptionManager {
    private readonly streams = new Map<Protocol.SPIDKey, number>()

    constructor(public readonly networkNode: NetworkNode) {}

    subscribe(streamId: string, streamPartition = 0): void {
        const key = Protocol.SPID.toKey(streamId, streamPartition)
        this.streams.set(key, this.streams.get(key) || 0)
        this.networkNode.subscribe(new SPID(streamId, streamPartition))
    }

    unsubscribe(streamId: string, streamPartition = 0): void {
        const key = Protocol.SPID.toKey(streamId, streamPartition)
        this.streams.set(key, (this.streams.get(key) || 0) - 1)

        if ((this.streams.get(key) || 0) <= 0) {
            this.streams.delete(key)

            this.networkNode.unsubscribe(new SPID(streamId, streamPartition))
        }
    }
}

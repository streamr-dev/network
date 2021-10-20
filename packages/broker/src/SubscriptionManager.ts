import { NetworkNode, Protocol } from 'streamr-network'

export class SubscriptionManager {
    streams = new Map<Protocol.SPIDKey, number>()

    constructor(public networkNode: NetworkNode) {
    }

    subscribe(streamId: string, streamPartition = 0): void {
        const spid = new Protocol.SPID(streamId, streamPartition)
        const key = spid.toKey()
        this.streams.set(key, this.streams.get(key) || 0)
        this.networkNode.subscribe(spid)
    }

    unsubscribe(streamId: string, streamPartition = 0): void {
        const spid = new Protocol.SPID(streamId, streamPartition)
        const key = spid.toKey()
        this.streams.set(key, (this.streams.get(key) || 0) - 1)

        if ((this.streams.get(key) || 0) <= 0) {
            this.streams.delete(key)

            this.networkNode.unsubscribe(spid)
        }
    }
}

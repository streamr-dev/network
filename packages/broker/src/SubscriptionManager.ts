import { NetworkNode } from 'streamr-network'

export class SubscriptionManager {
    streams = new Map<string, number>()

    constructor(public networkNode: NetworkNode) {
    }

    subscribe(streamId: string, streamPartition = 0): void {
        const key = `${streamId}::${streamPartition}`
        this.streams.set(key, this.streams.get(key) || 0)
        this.networkNode.subscribe(streamId, streamPartition)
    }

    unsubscribe(streamId: string, streamPartition = 0): void {
        const key = `${streamId}::${streamPartition}`
        this.streams.set(key, (this.streams.get(key) || 0) - 1)

        if ((this.streams.get(key) || 0) <= 0) {
            this.streams.delete(key)

            this.networkNode.unsubscribe(streamId, streamPartition)
        }
    }
}

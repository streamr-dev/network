module.exports = class SubscriptionManager {
    constructor(networkNode) {
        this.networkNode = networkNode
        this.streams = new Map()
    }

    subscribe(streamId, streamPartition = 0) {
        const key = `${streamId}::${streamPartition}`
        this.streams.set(key, (this.streams.get(key) || 0) + 1)

        this.networkNode.subscribe(streamId, streamPartition)
    }

    unsubscribe(streamId, streamPartition = 0) {
        const key = `${streamId}::${streamPartition}`
        this.streams.set(key, (this.streams.get(key) || 0) - 1)

        if (this.streams.get(key) <= 0) {
            this.streams.delete(key)

            this.networkNode.unsubscribe(streamId, streamPartition)
        }
    }
}

module.exports = class SubscriberManager {
    constructor(onFirstSubscriber = () => {}, onNoMoreSubscribers = () => {}) {
        this.subscribers = new Map()
        this.onFirstSubscriber = onFirstSubscriber
        this.onNoMoreSubscribers = onNoMoreSubscribers
    }

    subscribersForStream(streamId) {
        return this.subscribers.get(streamId) || []
    }

    addSubscriber(streamId, nodeAddress) {
        if (this._checkPermissions(streamId, nodeAddress)) {
            if (this.subscribers.has(streamId)) {
                const currentSubscribersForTheStream = this.subscribers.get(streamId)

                if (!currentSubscribersForTheStream.includes(nodeAddress)) {
                    this.subscribers.set(streamId, [...currentSubscribersForTheStream, nodeAddress])
                }
            } else {
                this.subscribers.set(streamId, [nodeAddress])
                this.onFirstSubscriber(streamId)
            }
        }
    }

    removeSubscriberFromAllStreams(nodeAddress) {
        this.subscribers.forEach((_, streamId) => {
            this.removeSubscriber(streamId, nodeAddress)
        })
    }

    removeSubscriber(streamId, nodeAddress) {
        if (this.subscribers.has(streamId)) {
            const newList = [...this.subscribers.get(streamId)]
                .filter((node) => node !== nodeAddress)
            this.subscribers.set(streamId, newList)

            if (newList.length === 0) {
                this.subscribers.delete(streamId)
                this.onNoMoreSubscribers(streamId)
            }
        }
    }

    _checkPermissions(streamId, nodeAddress) {
        return true
    }
}

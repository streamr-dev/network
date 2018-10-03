module.exports = class SubscriptionManager {
    constructor() {
        this.subscriptions = new Set()
        this.pendingSubscriptions = new Set()
    }

    addSubscription(streamId) {
        this.pendingSubscriptions.delete(streamId)
        this.subscriptions.add(streamId)
    }

    addPendingSubscription(streamId) {
        this.pendingSubscriptions.add(streamId)
    }

    removeSubscription(streamId) {
        this.subscriptions.delete(streamId)
    }

    hasSubscription(streamId) {
        return this.subscriptions.has(streamId)
    }

    hasPendingSubscription(streamId) {
        return this.pendingSubscriptions.has(streamId)
    }

    getSubscriptions() {
        return [...this.subscriptions]
    }

    getPendingSubscriptions() {
        return [...this.pendingSubscriptions]
    }
}

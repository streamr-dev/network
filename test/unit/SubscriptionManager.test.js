const SubscriptionManager = require('../../src/logic/SubscriptionManager')

describe('SubscriptionManager', () => {
    let manager

    beforeEach(() => {
        manager = new SubscriptionManager()
    })

    test('addPendingSubscription adds pending subscription', () => {
        manager.addPendingSubscription('stream-id')
        expect(manager.hasPendingSubscription('stream-id')).toBe(true)
    })

    test('addPendingSubscription does not add (non-pending) subscription', () => {
        manager.addPendingSubscription('stream-id')
        expect(manager.hasSubscription('stream-id')).toBe(false)
    })

    test('addSubscription adds (non-pending) subscription', () => {
        manager.addSubscription('stream-id')
        expect(manager.hasSubscription('stream-id')).toBe(true)
    })

    test('addSubscription does not add pending subscription', () => {
        manager.addSubscription('stream-id')
        expect(manager.hasPendingSubscription('stream-id')).toBe(false)
    })

    test('addSubscription removes pending subscription with same name if exists', () => {
        manager.addPendingSubscription('stream-id')
        expect(manager.hasPendingSubscription('stream-id')).toBe(true)

        manager.addSubscription('stream-id')
        expect(manager.hasPendingSubscription('stream-id')).toBe(false)
    })

    test('removeSubscription removes (non-pending) subscription', () => {
        manager.addSubscription('stream-id')
        manager.removeSubscription('stream-id')
        expect(manager.hasSubscription('stream-id')).toBe(false)
    })

    test('removeSubscription does not remove pending subscription', () => {
        manager.addPendingSubscription('stream-id')
        manager.removeSubscription('stream-id')
        expect(manager.hasPendingSubscription('stream-id')).toBe(true)
    })

    test('can list subscriptions', () => {
        manager.addSubscription('stream-1')
        manager.addSubscription('stream-2')
        manager.addPendingSubscription('should-not-appear')
        expect(manager.getSubscriptions()).toEqual(['stream-1', 'stream-2'])
    })

    test('can list pending subscriptions', () => {
        manager.addPendingSubscription('stream-1')
        manager.addPendingSubscription('stream-2')
        manager.addPendingSubscription('stream-3')
        manager.addSubscription('should-not-appear')
        expect(manager.getPendingSubscriptions()).toEqual(['stream-1', 'stream-2', 'stream-3'])
    })
})

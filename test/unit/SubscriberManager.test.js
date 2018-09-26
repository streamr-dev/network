const SubscriberManager = require('../../src/logic/SubscriberManager')

test('adding and requesting subscribers works', () => {
    const manager = new SubscriberManager()
    manager.addSubscriber('stream-1', '192.168.0.1')
    manager.addSubscriber('stream-1', '192.168.0.2')
    manager.addSubscriber('stream-1', '192.168.0.3')
    manager.addSubscriber('stream-2', '192.168.0.1')
    manager.addSubscriber('stream-2', '192.168.0.2')
    manager.addSubscriber('stream-3', '192.168.0.3')

    expect(manager.subscribersForStream('stream-1')).toEqual(['192.168.0.1', '192.168.0.2', '192.168.0.3'])
    expect(manager.subscribersForStream('stream-2')).toEqual(['192.168.0.1', '192.168.0.2'])
    expect(manager.subscribersForStream('stream-3')).toEqual(['192.168.0.3'])
    expect(manager.subscribersForStream('non-existing-stream')).toEqual([])
})

test('removing subscribers work', () => {
    const manager = new SubscriberManager()
    manager.addSubscriber('stream-1', '192.168.0.1')
    manager.addSubscriber('stream-1', '192.168.0.2')
    manager.addSubscriber('stream-1', '192.168.0.3')
    manager.addSubscriber('stream-2', '192.168.0.1')
    manager.addSubscriber('stream-2', '192.168.0.2')
    manager.addSubscriber('stream-3', '192.168.0.3')

    manager.removeSubscriber('stream-1', '192.168.0.2')
    manager.removeSubscriberFromAllStreams('192.168.0.3')

    expect(manager.subscribersForStream('stream-1')).toEqual(['192.168.0.1'])
    expect(manager.subscribersForStream('stream-3')).toEqual([])
})

test('cb onFirstSubscriber is invoked first time subscriber is added to stream', () => {
    const onFirstSubscriber = jest.fn()
    const manager = new SubscriberManager(onFirstSubscriber)

    manager.addSubscriber('stream-1', '192.168.0.1')
    manager.addSubscriber('stream-1', '192.168.0.2')
    manager.addSubscriber('stream-1', '192.168.0.3')

    expect(onFirstSubscriber).toBeCalledTimes(1)
    expect(onFirstSubscriber).toBeCalledWith('stream-1')
})

test('cb onFirstSubscriber is reset if all subscribers are removed', () => {
    const onFirstSubscriber = jest.fn()
    const manager = new SubscriberManager(onFirstSubscriber)

    manager.addSubscriber('stream-1', '192.168.0.1')
    manager.addSubscriber('stream-1', '192.168.0.2')
    manager.addSubscriber('stream-1', '192.168.0.3')
    expect(onFirstSubscriber).toBeCalledTimes(1)

    manager.removeSubscriber('stream-1', '192.168.0.1')
    manager.removeSubscriber('stream-1', '192.168.0.2')
    manager.removeSubscriber('stream-1', '192.168.0.3')

    manager.addSubscriber('stream-1', '192.168.0.1')
    manager.addSubscriber('stream-1', '192.168.0.2')
    manager.addSubscriber('stream-1', '192.168.0.3')
    expect(onFirstSubscriber).toBeCalledTimes(2)
})

test('cb onNoMoreSubscribers is invoked when last subscriber leaves stream', () => {
    const onNoMoreSubscribers = jest.fn()
    const manager = new SubscriberManager(() => {}, onNoMoreSubscribers)

    manager.addSubscriber('stream-1', '192.168.0.1')
    manager.addSubscriber('stream-1', '192.168.0.2')
    manager.addSubscriber('stream-1', '192.168.0.3')
    expect(onNoMoreSubscribers).toBeCalledTimes(0)

    manager.removeSubscriber('stream-1', '192.168.0.1')
    manager.removeSubscriber('stream-1', '192.168.0.3')
    expect(onNoMoreSubscribers).toBeCalledTimes(0)

    manager.removeSubscriber('stream-1', '192.168.0.2')
    expect(onNoMoreSubscribers).toBeCalledTimes(1)
    expect(onNoMoreSubscribers).toBeCalledWith('stream-1')
})

test('cb onNoMoreSubscribers is reset when new subscribers join', () => {
    const onNoMoreSubscribers = jest.fn()
    const manager = new SubscriberManager(() => {}, onNoMoreSubscribers)

    manager.addSubscriber('stream-1', '192.168.0.1')
    manager.addSubscriber('stream-1', '192.168.0.2')
    manager.addSubscriber('stream-1', '192.168.0.3')

    manager.removeSubscriber('stream-1', '192.168.0.1')
    manager.removeSubscriber('stream-1', '192.168.0.3')
    manager.removeSubscriber('stream-1', '192.168.0.2')
    expect(onNoMoreSubscribers).toBeCalledTimes(1)

    manager.removeSubscriber('stream-1', '192.168.0.1')
    manager.removeSubscriber('stream-1', '192.168.0.3')
    expect(onNoMoreSubscribers).toBeCalledTimes(1)

    manager.addSubscriber('stream-1', '192.168.0.2')
    manager.removeSubscriber('stream-1', '192.168.0.2')
    expect(onNoMoreSubscribers).toBeCalledTimes(2)
})

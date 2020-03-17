const { wait, waitForEvent, waitForCondition } = require('streamr-test-utils')

const { startNetworkNode, startTracker } = require('../../src/composition')
const Node = require('../../src/logic/Node')
const TrackerServer = require('../../src/protocol/TrackerServer')
const { LOCALHOST } = require('../util')
const { StreamIdAndPartition } = require('../../src/identifiers')

describe('check tracker, nodes and statuses from nodes', () => {
    let tracker
    let subscriberOne
    let subscriberTwo

    const s1 = new StreamIdAndPartition('stream-1', 0)
    const s2 = new StreamIdAndPartition('stream-2', 2)

    beforeEach(async () => {
        tracker = await startTracker(LOCALHOST, 32400, 'tracker')
        subscriberOne = await startNetworkNode(LOCALHOST, 33371, 'subscriberOne')
        subscriberTwo = await startNetworkNode(LOCALHOST, 33372, 'subscriberTwo')

        subscriberOne.subscribeToStreamIfHaveNotYet(s1)
        subscriberOne.subscribeToStreamIfHaveNotYet(s2)

        subscriberTwo.subscribeToStreamIfHaveNotYet(s1)
        subscriberTwo.subscribeToStreamIfHaveNotYet(s2)
    })

    afterEach(async () => {
        await subscriberOne.stop()
        await subscriberTwo.stop()
        await tracker.stop()
    })

    it('should be able to start tracker, two nodes, receive statuses, create overlayPerStream for streams, then stop them successfully', async () => {
        expect(tracker.protocols.trackerServer.endpoint.connections.size).toBe(0)
        expect(tracker.overlayPerStream).toEqual({})

        subscriberOne.addBootstrapTracker(tracker.getAddress())
        await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)
        expect(tracker.protocols.trackerServer.endpoint.connections.size).toBe(1)

        expect(Object.keys(tracker.overlayPerStream)).toEqual(['stream-1::0', 'stream-2::2'])
        expect(tracker.overlayPerStream['stream-1::0'].state()).toEqual({
            subscriberOne: []
        })
        expect(tracker.overlayPerStream['stream-2::2'].state()).toEqual({
            subscriberOne: []
        })

        subscriberTwo.addBootstrapTracker(tracker.getAddress())
        await Promise.all([
            waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED),
            waitForEvent(subscriberOne, Node.events.NODE_SUBSCRIBED)
        ])

        expect(tracker.protocols.trackerServer.endpoint.connections.size).toBe(2)

        expect(Object.keys(tracker.overlayPerStream)).toEqual(['stream-1::0', 'stream-2::2'])
        expect(tracker.overlayPerStream['stream-1::0'].state()).toEqual({
            subscriberOne: ['subscriberTwo'],
            subscriberTwo: ['subscriberOne'],
        })
        expect(tracker.overlayPerStream['stream-2::2'].state()).toEqual({
            subscriberOne: ['subscriberTwo'],
            subscriberTwo: ['subscriberOne']
        })
    })

    it('tracker should update correctly overlayPerStream on subscribe/unsubscribe', async () => {
        subscriberOne.addBootstrapTracker(tracker.getAddress())
        subscriberTwo.addBootstrapTracker(tracker.getAddress())

        await Promise.all([
            waitForEvent(subscriberOne, Node.events.NODE_SUBSCRIBED),
            waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)
        ])

        await wait(100)
        subscriberOne.unsubscribeFromStream(s2)
        await Promise.all([
            waitForEvent(subscriberTwo, Node.events.NODE_UNSUBSCRIBED),
            waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)
        ])

        expect(Object.keys(tracker.overlayPerStream)).toEqual(['stream-1::0', 'stream-2::2'])
        expect(tracker.overlayPerStream['stream-1::0'].state()).toEqual({
            subscriberOne: ['subscriberTwo'],
            subscriberTwo: ['subscriberOne'],
        })
        expect(tracker.overlayPerStream['stream-2::2'].state()).toEqual({
            subscriberTwo: []
        })

        subscriberOne.unsubscribeFromStream(s1)
        const res = {
            subscriberTwo: []
        }

        await waitForCondition(() => Object.keys(tracker.overlayPerStream['stream-1::0'].state()).length === 1)
        expect(Object.keys(tracker.overlayPerStream)).toEqual(['stream-1::0', 'stream-2::2'])
        expect(tracker.overlayPerStream['stream-1::0'].state()).toEqual(res)
        expect(tracker.overlayPerStream['stream-2::2'].state()).toEqual(res)

        subscriberTwo.unsubscribeFromStream(s1)
        await waitForCondition(() => tracker.overlayPerStream['stream-1::0'] === undefined, 10000)
        subscriberTwo.unsubscribeFromStream(s2)
        await waitForCondition(() => tracker.overlayPerStream['stream-2::2'] === undefined, 10000)
    }, 10000)

    it('tracker getTopology should report correct topology based on parameters and current state', async () => {
        expect(tracker.getTopology()).toEqual({})
        subscriberOne.addBootstrapTracker(tracker.getAddress())
        await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)
        expect(tracker.getTopology()).toEqual({
            'stream-1::0': {
                subscriberOne: [],
            },
            'stream-2::2': {
                subscriberOne: [],
            },
        })
        expect(tracker.getTopology('stream-1', null)).toEqual({
            'stream-1::0': {
                subscriberOne: [],
            }
        })

        expect(tracker.getTopology('stream-2', 2)).toEqual({
            'stream-2::2': {
                subscriberOne: [],
            }
        })

        subscriberTwo.addBootstrapTracker(tracker.getAddress())
        await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)

        expect(tracker.getTopology()).toEqual({
            'stream-1::0': {
                subscriberOne: ['subscriberTwo'],
                subscriberTwo: ['subscriberOne']
            },
            'stream-2::2': {
                subscriberOne: ['subscriberTwo'],
                subscriberTwo: ['subscriberOne']
            }
        })
        expect(tracker.getTopology('stream-1', null)).toEqual({
            'stream-1::0': {
                subscriberOne: ['subscriberTwo'],
                subscriberTwo: ['subscriberOne']
            }
        })

        expect(tracker.getTopology('stream-2', 2)).toEqual({
            'stream-2::2': {
                subscriberOne: ['subscriberTwo'],
                subscriberTwo: ['subscriberOne']
            }
        })

        await wait(100)

        subscriberOne.unsubscribeFromStream(s1)
        await waitForCondition(() => Object.keys(tracker.overlayPerStream['stream-1::0'].state()).length === 1)

        expect(tracker.getTopology()).toEqual({
            'stream-1::0': {
                subscriberTwo: []
            },
            'stream-2::2': {
                subscriberOne: ['subscriberTwo'],
                subscriberTwo: ['subscriberOne']
            }
        })
        expect(tracker.getTopology('stream-1', null)).toEqual({
            'stream-1::0': {
                subscriberTwo: []
            }
        })

        expect(tracker.getTopology('stream-2', 2)).toEqual({
            'stream-2::2': {
                subscriberOne: ['subscriberTwo'],
                subscriberTwo: ['subscriberOne']
            }
        })

        subscriberOne.unsubscribeFromStream(s2)
        await waitForCondition(() => Object.keys(tracker.overlayPerStream['stream-2::2'].state()).length === 1)

        expect(tracker.getTopology()).toEqual({
            'stream-1::0': {
                subscriberTwo: []
            },
            'stream-2::2': {
                subscriberTwo: []
            }
        })
        expect(tracker.getTopology('stream-1', null)).toEqual({
            'stream-1::0': {
                subscriberTwo: []
            }
        })

        expect(tracker.getTopology('stream-2', 2)).toEqual({
            'stream-2::2': {
                subscriberTwo: []
            }
        })

        subscriberTwo.unsubscribeFromStream(s1)
        await waitForCondition(() => tracker.overlayPerStream['stream-1::0'] === undefined)

        expect(tracker.getTopology()).toEqual({
            'stream-2::2': {
                subscriberTwo: []
            }
        })
        expect(tracker.getTopology('stream-1', null)).toEqual({})

        expect(tracker.getTopology('stream-2', 2)).toEqual({
            'stream-2::2': {
                subscriberTwo: []
            }
        })

        subscriberTwo.unsubscribeFromStream(s2)
        await waitForCondition(() => tracker.overlayPerStream['stream-2::2'] === undefined)

        expect(tracker.getTopology()).toEqual({})
        expect(tracker.getTopology('stream-1', null)).toEqual({})
        expect(tracker.getTopology('stream-2', 2)).toEqual({})
    })
})

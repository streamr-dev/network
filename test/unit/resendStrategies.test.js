const { EventEmitter } = require('events')
const intoStream = require('into-stream')
const { AskNeighborsResendStrategy,
    StorageResendStrategy,
    StorageNodeResendStrategy } = require('../../src/logic/resendStrategies')
const ResendLastRequest = require('../../src/messages/ResendLastRequest')
const ResendFromRequest = require('../../src/messages/ResendFromRequest')
const ResendRangeRequest = require('../../src/messages/ResendRangeRequest')
const ResendResponseNoResend = require('../../src/messages/ResendResponseNoResend')
const ResendResponseResending = require('../../src/messages/ResendResponseResending')
const ResendResponseResent = require('../../src/messages/ResendResponseResent')
const StorageNodesMessage = require('../../src/messages/StorageNodesMessage')
const UnicastMessage = require('../../src/messages/UnicastMessage')
const { wait } = require('../util')
const { MessageID, MessageReference, StreamID } = require('../../src/identifiers')
const NodeToNode = require('../../src/protocol/NodeToNode')
const TrackerNode = require('../../src/protocol/TrackerNode')

/**
 * Collect data of a stream into an array. The array is wrapped in a Promise
 * that resolves when the stream has ended, i.e., event `end` is emitted by
 * stream.
 */
function streamToArray(stream) {
    const arr = []
    return new Promise((resolve, reject) => {
        stream
            .on('data', arr.push.bind(arr))
            .on('error', reject)
            .on('end', () => resolve(arr))
    })
}

describe('StorageResendStrategy#getResendResponseStream', () => {
    let storage
    let resendStrategy

    beforeEach(async () => {
        storage = {}
        resendStrategy = new StorageResendStrategy(storage)
    })

    test('on receiving ResendLastRequest, storage#requestLast is invoked', async () => {
        storage.requestLast = jest.fn().mockReturnValueOnce(intoStream.object([]))

        resendStrategy.getResendResponseStream(new ResendLastRequest(new StreamID('streamId', 0), 'subId', 10))

        expect(storage.requestLast.mock.calls).toEqual([
            ['streamId', 0, 10]
        ])
    })

    test('on receiving ResendFromRequest, storage#requestFrom is invoked', async () => {
        storage.requestFrom = jest.fn().mockReturnValueOnce(intoStream.object([]))

        resendStrategy.getResendResponseStream(new ResendFromRequest(
            new StreamID('streamId', 0),
            'subId',
            new MessageReference(1555555555555, 0),
            'publisherId'
        ))

        expect(storage.requestFrom.mock.calls).toEqual([
            ['streamId', 0, 1555555555555, 0, 'publisherId']
        ])
    })

    test('on receiving ResendRangeRequest, storage#requestRange is invoked', async () => {
        storage.requestRange = jest.fn().mockReturnValueOnce(intoStream.object([]))

        resendStrategy.getResendResponseStream(new ResendRangeRequest(
            new StreamID('streamId', 0),
            'subId',
            new MessageReference(1555555555555, 0),
            new MessageReference(1555555555555, 1000),
            'publisherId'
        ))

        expect(storage.requestRange.mock.calls).toEqual([
            ['streamId', 0, 1555555555555, 0, 1555555555555, 1000, 'publisherId']
        ])
    })

    test('data of storage stream are transformed into UnicastMessages for response stream', async () => {
        storage.requestLast = jest.fn().mockReturnValueOnce(intoStream.object([
            {
                timestamp: 0,
                sequenceNo: 0,
                publisherId: 'publisherId',
                msgChainId: 'msgChainId',
                data: {
                    hello: 'world'
                },
                signature: 'signature',
                signatureType: 2,
            },
            {
                timestamp: 10,
                sequenceNo: 10,
                publisherId: 'publisherId',
                msgChainId: 'msgChainId',
                previousTimestamp: 0,
                previousSequenceNo: 0,
                data: {},
                signature: 'signature',
                signatureType: 2,
            }
        ]))

        const responseStream = resendStrategy.getResendResponseStream(
            new ResendLastRequest(new StreamID('streamId', 0), 'subId', 10)
        )
        const streamAsArray = await streamToArray(responseStream)
        expect(streamAsArray).toEqual([
            new UnicastMessage(
                new MessageID(new StreamID('streamId', 0), 0, 0, 'publisherId', 'msgChainId'),
                null,
                {
                    hello: 'world'
                },
                'signature',
                2,
                'subId'
            ),
            new UnicastMessage(
                new MessageID(new StreamID('streamId', 0), 10, 10, 'publisherId', 'msgChainId'),
                new MessageReference(0, 0),
                {},
                'signature',
                2,
                'subId'
            )
        ])
    })
})

describe('AskNeighborsResendStrategy#getResendResponseStream', () => {
    const TIMEOUT = 50
    let nodeToNode
    let getNeighbors
    let resendStrategy
    let request

    beforeEach(async () => {
        nodeToNode = new EventEmitter()
        getNeighbors = jest.fn()
        resendStrategy = new AskNeighborsResendStrategy(nodeToNode, getNeighbors, 2, TIMEOUT)
        request = new ResendLastRequest(new StreamID('streamId', 0), 'subId', 10)
    })

    afterEach(() => {
        resendStrategy.stop()
    })

    test('if given non-local request returns empty stream', async () => {
        request = new ResendLastRequest(new StreamID('streamId', 0), 'subId', 10, 'non-local')
        const responseStream = resendStrategy.getResendResponseStream(request)
        const streamAsArray = await streamToArray(responseStream)
        expect(streamAsArray).toEqual([])
    })

    test('if no neighbors available returns empty stream', async () => {
        getNeighbors.mockReturnValueOnce([])
        const responseStream = resendStrategy.getResendResponseStream(request)
        const streamAsArray = await streamToArray(responseStream)
        expect(streamAsArray).toEqual([])
    })

    describe('if neighbors available', () => {
        beforeEach(() => {
            getNeighbors.mockReturnValue(['neighbor-1', 'neighbor-2', 'neighbor-3'])
        })

        test('forwards request to first neighbor', async () => {
            nodeToNode.send = jest.fn().mockReturnValueOnce(Promise.resolve())

            resendStrategy.getResendResponseStream(request)

            expect(nodeToNode.send).toBeCalledTimes(1)
            expect(nodeToNode.send).toBeCalledWith('neighbor-1', request)
        })

        test('if forwarding request to first neighbor fails, forwards to 2nd', async () => {
            nodeToNode.send = jest.fn()
                .mockReturnValueOnce(Promise.reject())
                .mockReturnValueOnce(Promise.resolve())

            resendStrategy.getResendResponseStream(request)
            await wait(0)

            expect(nodeToNode.send).toBeCalledTimes(2)
            expect(nodeToNode.send).toBeCalledWith('neighbor-1', request)
            expect(nodeToNode.send).toBeCalledWith('neighbor-2', request)
        })

        test('if forwarding request to both neighbors fails (maxTries=2) returns empty stream', async () => {
            nodeToNode.send = jest.fn()
                .mockReturnValueOnce(Promise.reject())
                .mockReturnValueOnce(Promise.reject())

            const responseStream = resendStrategy.getResendResponseStream(request)
            const streamAsArray = await streamToArray(responseStream)
            expect(streamAsArray).toEqual([])
        })

        test('avoids forwarding request to same neighbor again', () => {
            getNeighbors.mockClear()
            getNeighbors.mockReturnValue(['neighbor-1', 'neighbor-1', 'neighbor-1'])
            nodeToNode.send = jest.fn().mockReturnValue(Promise.reject())

            resendStrategy.getResendResponseStream(request)

            expect(nodeToNode.send).toBeCalledTimes(1)
        })
    })

    describe('after successfully forwarding request to neighbor', () => {
        let responseStream

        beforeEach(() => {
            getNeighbors.mockReturnValue(['neighbor-1', 'neighbor-2'])
            nodeToNode.send = jest.fn().mockReturnValue(Promise.resolve())
            responseStream = resendStrategy.getResendResponseStream(request)
            expect(nodeToNode.send).toBeCalledTimes(1) // sanity check
        })

        test('if no response within timeout, move to next neighbor', (done) => {
            setTimeout(() => {
                expect(nodeToNode.send).toBeCalledTimes(2)
                done()
            }, TIMEOUT)
        })

        test('if neighbor disconnects, move to next neighbor', () => {
            nodeToNode.emit(NodeToNode.events.NODE_DISCONNECTED, 'neighbor-1')
            expect(nodeToNode.send).toBeCalledTimes(2)
        })

        test('if neighbor responds with ResendResponseResending, extend timeout', (done) => {
            setTimeout(() => {
                expect(nodeToNode.send).toBeCalledTimes(1)
                done()
            }, TIMEOUT)

            nodeToNode.emit(NodeToNode.events.RESEND_RESPONSE,
                new ResendResponseResending(new StreamID('streamId', 0), 'subId', 'neighbor-1'))
        })

        test('if neighbor responds with UnicastMessage, extend timeout', (done) => {
            setTimeout(() => {
                expect(nodeToNode.send).toBeCalledTimes(1)
                done()
            }, TIMEOUT)

            nodeToNode.emit(NodeToNode.events.UNICAST_RECEIVED, new UnicastMessage(
                new MessageID(new StreamID('streamId', 0), 0, 0, '', ''),
                null,
                {},
                '',
                0,
                'subId',
                'neighbor-1'
            ))
        })

        test('if neighbor responds with ResendResponseNoResend, move to next neighbor', () => {
            nodeToNode.emit(NodeToNode.events.RESEND_RESPONSE,
                new ResendResponseNoResend(new StreamID('streamId', 0), 'subId', 'neighbor-1'))
            expect(nodeToNode.send).toBeCalledTimes(2)
        })

        test('if neighbor responds with ResendResponseResent, returned stream is closed', async () => {
            nodeToNode.emit(NodeToNode.events.RESEND_RESPONSE,
                new ResendResponseResent(new StreamID('streamId', 0), 'subId', 'neighbor-1'))

            await streamToArray(responseStream)

            expect(nodeToNode.send).toBeCalledTimes(1) // ensure next neighbor wasn't asked
        })

        test('all UnicastMessages received from neighbor are pushed to returned stream', async () => {
            const createUnicastMessage = (timestamp) => new UnicastMessage(
                new MessageID(new StreamID('streamId', 0), timestamp, 0, '', ''),
                null,
                {},
                '',
                0,
                'subId',
                'neighbor-1'
            )

            const u1 = createUnicastMessage(0)
            const u2 = createUnicastMessage(1000)
            const u3 = createUnicastMessage(11000)
            const u4 = createUnicastMessage(21000)
            const u5 = createUnicastMessage(22000)

            nodeToNode.emit(NodeToNode.events.UNICAST_RECEIVED, u1)
            nodeToNode.emit(NodeToNode.events.UNICAST_RECEIVED, u2)
            await wait(10)
            nodeToNode.emit(NodeToNode.events.UNICAST_RECEIVED, u3)
            await wait(10)
            nodeToNode.emit(NodeToNode.events.UNICAST_RECEIVED, u4)
            nodeToNode.emit(NodeToNode.events.UNICAST_RECEIVED, u5)
            nodeToNode.emit(NodeToNode.events.RESEND_RESPONSE,
                new ResendResponseResent(new StreamID('streamId', 0), 'subId', 'neighbor-1'))

            const streamAsArray = await streamToArray(responseStream)
            expect(streamAsArray).toEqual([u1, u2, u3, u4, u5])
        })
    })
})

describe('StorageNodeResendStrategy#getResendResponseStream', () => {
    const TIMEOUT = 50
    let nodeToNode
    let trackerNode
    let getTracker
    let isSubscribedTo
    let resendStrategy
    let request

    beforeEach(async () => {
        nodeToNode = new EventEmitter()
        trackerNode = new EventEmitter()
        getTracker = jest.fn()
        isSubscribedTo = jest.fn()
        resendStrategy = new StorageNodeResendStrategy(trackerNode, nodeToNode, getTracker, isSubscribedTo, TIMEOUT)
        request = new ResendLastRequest(new StreamID('streamId', 0), 'subId', 10)
    })

    afterEach(() => {
        resendStrategy.stop()
    })

    test('if given non-local request returns empty stream', async () => {
        request = new ResendLastRequest(new StreamID('streamId', 0), 'subId', 10, 'non-local')
        const responseStream = resendStrategy.getResendResponseStream(request)
        const streamAsArray = await streamToArray(responseStream)
        expect(streamAsArray).toEqual([])
    })

    test('if tracker not available returns empty stream', async () => {
        getTracker.mockReturnValueOnce(undefined)
        const responseStream = resendStrategy.getResendResponseStream(request)
        const streamAsArray = await streamToArray(responseStream)
        expect(streamAsArray).toEqual([])
    })

    describe('if tracker available', () => {
        beforeEach(() => {
            getTracker.mockReturnValue('tracker')
        })

        test('attempts to find storage nodes via tracker', async () => {
            trackerNode.findStorageNodes = jest.fn().mockReturnValueOnce(Promise.resolve())

            resendStrategy.getResendResponseStream(request)

            expect(trackerNode.findStorageNodes).toBeCalledTimes(1)
            expect(trackerNode.findStorageNodes).toBeCalledWith('tracker', new StreamID('streamId', 0))
        })

        test('if communication with tracker fails, returns empty stream', async () => {
            trackerNode.findStorageNodes = jest.fn().mockReturnValueOnce(Promise.reject())

            const responseStream = resendStrategy.getResendResponseStream(request)
            const streamAsArray = await streamToArray(responseStream)
            expect(streamAsArray).toEqual([])
        })
    })

    describe('after sending storage node query to tracker', () => {
        let responseStream

        beforeEach(() => {
            getTracker.mockReturnValue(['tracker'])
            trackerNode.findStorageNodes = jest.fn().mockReturnValue(Promise.resolve())
            responseStream = resendStrategy.getResendResponseStream(request)
        })

        test('if tracker does not respond within timeout, returns empty stream', async () => {
            const streamAsArray = await streamToArray(responseStream)
            expect(streamAsArray).toEqual([])
        })

        test('if tracker responds with zero storage nodes, returns empty stream', async () => {
            trackerNode.emit(
                TrackerNode.events.STORAGE_NODES_RECEIVED,
                new StorageNodesMessage(new StreamID('streamId', 0), [])
            )
            const streamAsArray = await streamToArray(responseStream)
            expect(streamAsArray).toEqual([])
        })

        test('if tracker responds with storage nodes, connects to them one by one until success', async () => {
            nodeToNode.disconnectFromNode = jest.fn()
            nodeToNode.send = jest.fn().mockReturnValue(Promise.resolve())
            nodeToNode.connectToNode = jest.fn()
                .mockReturnValueOnce(Promise.reject())
                .mockReturnValueOnce(Promise.reject())
                .mockReturnValueOnce(Promise.resolve())
                .mockReturnValueOnce(Promise.resolve())

            trackerNode.emit(
                TrackerNode.events.STORAGE_NODES_RECEIVED,
                new StorageNodesMessage(new StreamID('streamId', 0), [
                    'ws://storageNode-1',
                    'ws://storageNode-2',
                    'ws://storageNode-3',
                    'ws://storageNode-4'
                ])
            )
            await wait(0) // Defer execution of below assertions

            expect(nodeToNode.connectToNode).toBeCalledTimes(3)
            expect(nodeToNode.connectToNode).toBeCalledWith('ws://storageNode-1')
            expect(nodeToNode.connectToNode).toBeCalledWith('ws://storageNode-2')
            expect(nodeToNode.connectToNode).toBeCalledWith('ws://storageNode-3')
        })

        test('if tracker responds with non-connectable storage nodes, returns empty stream', async () => {
            nodeToNode.connectToNode = jest.fn()
                .mockReturnValue(Promise.reject())

            trackerNode.emit(
                TrackerNode.events.STORAGE_NODES_RECEIVED,
                new StorageNodesMessage(new StreamID('streamId', 0), [
                    'ws://storageNode-1',
                    'ws://storageNode-2'
                ])
            )

            const streamAsArray = await streamToArray(responseStream)
            expect(streamAsArray).toEqual([])
        })
    })

    describe('after connecting to a storage node', () => {
        let responseStream

        beforeEach(() => {
            getTracker.mockReturnValue(['tracker'])
            trackerNode.findStorageNodes = () => Promise.resolve()
            nodeToNode.connectToNode = () => Promise.resolve('storageNode')
            nodeToNode.send = jest.fn()
            nodeToNode.disconnectFromNode = jest.fn()

            responseStream = resendStrategy.getResendResponseStream(request)
        })

        const emitTrackerResponse = async () => {
            trackerNode.emit(
                TrackerNode.events.STORAGE_NODES_RECEIVED,
                new StorageNodesMessage(new StreamID('streamId', 0), ['ws://storageNode'])
            )
            await wait(0) // defer execution
        }

        test('forwards request to storage node', async () => {
            nodeToNode.send.mockReturnValue(Promise.resolve())

            await emitTrackerResponse()

            expect(nodeToNode.send).toBeCalledTimes(1)
            expect(nodeToNode.send).toBeCalledWith('storageNode', request)
        })

        test('if forwarding request to storage node fails, returns empty stream', async () => {
            nodeToNode.send.mockReturnValue(Promise.reject())

            await emitTrackerResponse()

            const streamAsArray = await streamToArray(responseStream)
            expect(streamAsArray).toEqual([])
            expect(nodeToNode.send).toBeCalledTimes(1) // sanity check
        })

        test('if storage node disconnects, returns empty stream', async () => {
            nodeToNode.send.mockReturnValue(Promise.resolve())

            await emitTrackerResponse()
            nodeToNode.emit(NodeToNode.events.NODE_DISCONNECTED, 'storageNode')

            const streamAsArray = await streamToArray(responseStream)
            expect(streamAsArray).toEqual([])
            expect(nodeToNode.send).toBeCalledTimes(1) // sanity check
        })
    })

    describe('after forwarding request to storage node', () => {
        let responseStream

        beforeEach(async () => {
            getTracker.mockReturnValue(['tracker'])
            trackerNode.findStorageNodes = () => Promise.resolve()
            nodeToNode.connectToNode = () => Promise.resolve('storageNode')
            nodeToNode.send = jest.fn().mockResolvedValue(null)
            nodeToNode.disconnectFromNode = jest.fn()

            responseStream = resendStrategy.getResendResponseStream(request)
            await wait(0) // wait for this.trackerNode.findStorageNodes(...)

            trackerNode.emit(
                TrackerNode.events.STORAGE_NODES_RECEIVED,
                new StorageNodesMessage(new StreamID('streamId', 0), ['ws://storageNode'])
            )
        })

        test('if no response within timeout, returns empty stream', (done) => {
            setTimeout(async () => {
                // eslint-disable-next-line no-underscore-dangle
                expect(responseStream._readableState.ended).toEqual(true)
                const streamAsArray = await streamToArray(responseStream)
                expect(streamAsArray).toEqual([])
                done()
            }, TIMEOUT)
        })

        test('if storage node responds with ResendResponseResending, extend timeout', (done) => {
            setTimeout(() => {
                // eslint-disable-next-line no-underscore-dangle
                expect(responseStream._readableState.ended).toEqual(false)
                done()
            }, TIMEOUT)

            nodeToNode.emit(NodeToNode.events.RESEND_RESPONSE,
                new ResendResponseResending(new StreamID('streamId', 0), 'subId', 'storageNode'))
        })

        test('if storage node responds with UnicastMessage, extend timeout', (done) => {
            setTimeout(() => {
                // eslint-disable-next-line no-underscore-dangle
                expect(responseStream._readableState.ended).toEqual(false)
                done()
            }, TIMEOUT)

            nodeToNode.emit(NodeToNode.events.UNICAST_RECEIVED, new UnicastMessage(
                new MessageID(new StreamID('streamId', 0), 0, 0, '', ''),
                null,
                {},
                '',
                0,
                'subId',
                'storageNode'
            ))
        })

        test('if storage node responds with ResendResponseNoResend, returned stream is closed', () => {
            nodeToNode.emit(NodeToNode.events.RESEND_RESPONSE,
                new ResendResponseNoResend(new StreamID('streamId', 0), 'subId', 'storageNode'))
            // eslint-disable-next-line no-underscore-dangle
            expect(responseStream._readableState.ended).toEqual(true)
        })

        test('all UnicastMessages received from storage node are pushed to returned stream', async () => {
            const createUnicastMessage = (timestamp) => new UnicastMessage(
                new MessageID(new StreamID('streamId', 0), timestamp, 0, '', ''),
                null,
                {},
                '',
                0,
                'subId',
                'storageNode'
            )

            const u1 = createUnicastMessage(0)
            const u2 = createUnicastMessage(1000)
            const u3 = createUnicastMessage(11000)
            const u4 = createUnicastMessage(21000)
            const u5 = createUnicastMessage(22000)

            nodeToNode.emit(NodeToNode.events.UNICAST_RECEIVED, u1)
            nodeToNode.emit(NodeToNode.events.UNICAST_RECEIVED, u2)
            await wait(10)
            nodeToNode.emit(NodeToNode.events.UNICAST_RECEIVED, u3)
            await wait(10)
            nodeToNode.emit(NodeToNode.events.UNICAST_RECEIVED, u4)
            nodeToNode.emit(NodeToNode.events.UNICAST_RECEIVED, u5)
            nodeToNode.emit(NodeToNode.events.RESEND_RESPONSE,
                new ResendResponseResent(new StreamID('streamId', 0), 'subId', 'storageNode'))

            const streamAsArray = await streamToArray(responseStream)
            expect(streamAsArray).toEqual([u1, u2, u3, u4, u5])
        })
    })

    describe('after connecting to storage node and on response stream closed', () => {
        let responseStream

        beforeEach(() => {
            getTracker.mockReturnValue(['tracker'])
            trackerNode.findStorageNodes = () => Promise.resolve()
            nodeToNode.connectToNode = () => Promise.resolve('storageNode')
            nodeToNode.send = () => Promise.resolve()
            nodeToNode.disconnectFromNode = jest.fn()

            responseStream = resendStrategy.getResendResponseStream(request)

            setImmediate(() => {
                trackerNode.emit(
                    TrackerNode.events.STORAGE_NODES_RECEIVED,
                    new StorageNodesMessage(new StreamID('streamId', 0), ['ws://storageNode'])
                )
            })

            // Causes the stream to end. Other ways to end are a) failing to forward request and b) timeout. All of
            // them have same handling logic so testing only one case here.
            setImmediate(() => {
                nodeToNode.emit(
                    NodeToNode.events.RESEND_RESPONSE,
                    new ResendResponseResending(new StreamID('streamId', 0), 'subId', 'storageNode')
                )
            })
        })

        test('if not (previously) subscribed to storage node, disconnect from storage node', async () => {
            isSubscribedTo.mockReturnValue(false)
            await streamToArray(responseStream)
            expect(nodeToNode.disconnectFromNode).toBeCalledTimes(1)
            expect(nodeToNode.disconnectFromNode).toBeCalledWith('storageNode')
        })

        test('if (previously) subscribed to storage node, do not disconnect from storage node', async () => {
            isSubscribedTo.mockReturnValue(true)
            await streamToArray(responseStream)
            expect(nodeToNode.disconnectFromNode).toBeCalledTimes(0)
        })
    })
})

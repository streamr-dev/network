const { EventEmitter } = require('events')

const intoStream = require('into-stream')
const { MessageLayer, ControlLayer } = require('streamr-client-protocol')
const { waitForStreamToEnd } = require('streamr-test-utils')

const { AskNeighborsResendStrategy,
    StorageResendStrategy,
    StorageNodeResendStrategy } = require('../../src/logic/resendStrategies')
const StorageNodesMessage = require('../../src/messages/StorageNodesMessage')
const { StreamIdAndPartition } = require('../../src/identifiers')
const NodeToNode = require('../../src/protocol/NodeToNode')
const TrackerNode = require('../../src/protocol/TrackerNode')

const { StreamMessage, MessageID, MessageRef } = MessageLayer
const { ResendLastRequest, ResendFromRequest, ResendRangeRequest } = ControlLayer

jest.useFakeTimers()

const TIMEOUT = 10000

const resendLastRequest = new ResendLastRequest({
    streamId: 'streamId',
    streamPartition: 0,
    requestId: 'requestId',
    numberLast: 10,
})

const resendFromRequest = new ResendFromRequest({
    streamId: 'streamId',
    streamPartition: 0,
    requestId: 'requestId',
    fromMsgRef: new MessageRef(1555555555555, 0),
    publisherId: 'publisherId',
    msgChainId: 'msgChainId',
})

const resendRangeRequest = new ResendRangeRequest({
    streamId: 'streamId',
    streamPartition: 0,
    requestId: 'requestId',
    fromMsgRef: new MessageRef(1555555555555, 0),
    toMsgRef: new MessageRef(1555555555555, 1000),
    publisherId: 'publisherId',
    msgChainId: 'msgChainId',
})

const msg1 = new StreamMessage({
    messageId: new MessageID('streamId', 0, 0, 0, 'publisherId', 'msgChainId'),
    content: {
        hello: 'world'
    },
})
const msg2 = new StreamMessage({
    messageId: new MessageID('streamId', 0, 10, 10, 'publisherId', 'msgChainId'),
    prevMsgRef: new MessageRef(0, 0),
    content: {},
})

const resendResponseNoResend = new ControlLayer.ResendResponseNoResend({
    streamId: 'streamId', streamPartition: 0, requestId: 'requestId'
})

const resendResponseResending = new ControlLayer.ResendResponseResending({
    streamId: 'streamId', streamPartition: 0, requestId: 'requestId'
})

const resendResponseResent = new ControlLayer.ResendResponseResent({
    streamId: 'streamId', streamPartition: 0, requestId: 'requestId'
})

const createUnicastMessage = (timestamp = 0) => {
    const streamMessage = new MessageLayer.StreamMessage({
        messageId: new MessageID('streamId', 0, timestamp, 0, '', ''),
        content: {},
    })
    return new ControlLayer.UnicastMessage({
        requestId: 'requestId', streamMessage
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

        resendStrategy.getResendResponseStream(resendLastRequest)

        expect(storage.requestLast.mock.calls).toEqual([
            [resendLastRequest.streamId, resendLastRequest.streamPartition, resendLastRequest.numberLast]
        ])
    })

    test('on receiving ResendFromRequest, storage#requestFrom is invoked', async () => {
        storage.requestFrom = jest.fn().mockReturnValueOnce(intoStream.object([]))

        resendStrategy.getResendResponseStream(resendFromRequest)

        expect(storage.requestFrom.mock.calls).toEqual([[
            resendFromRequest.streamId, resendFromRequest.streamPartition,
            resendFromRequest.fromMsgRef.timestamp, resendFromRequest.fromMsgRef.sequenceNumber,
            resendFromRequest.publisherId, resendFromRequest.msgChainId
        ]])
    })

    test('on receiving ResendRangeRequest, storage#requestRange is invoked', async () => {
        storage.requestRange = jest.fn().mockReturnValueOnce(intoStream.object([]))

        resendStrategy.getResendResponseStream(resendRangeRequest)

        expect(storage.requestRange.mock.calls).toEqual([[
            resendRangeRequest.streamId, resendRangeRequest.streamPartition,
            resendRangeRequest.fromMsgRef.timestamp, resendRangeRequest.fromMsgRef.sequenceNumber,
            resendRangeRequest.toMsgRef.timestamp, resendRangeRequest.toMsgRef.sequenceNumber,
            resendRangeRequest.publisherId, resendRangeRequest.msgChainId
        ]])
    })

    test('data of storage stream are transformed into UnicastMessages for response stream', async () => {
        storage.requestLast = jest.fn().mockReturnValueOnce(intoStream.object([msg1, msg2]))

        const responseStream = resendStrategy.getResendResponseStream(resendLastRequest)
        const streamAsArray = await waitForStreamToEnd(responseStream)
        expect(streamAsArray).toEqual([
            new ControlLayer.UnicastMessage({
                requestId: 'requestId', streamMessage: msg1
            }),
            new ControlLayer.UnicastMessage({
                requestId: 'requestId', streamMessage: msg2
            }),
        ])
    })

    test('closing response stream also closes (original) the underlying storage stream', (done) => {
        const storageStream = intoStream.object([])
        storage.requestRange = jest.fn().mockReturnValueOnce(storageStream)

        const responseStream = resendStrategy.getResendResponseStream(resendRangeRequest)

        responseStream.destroy()

        setImmediate(() => {
            expect(storageStream.destroyed).toEqual(true)
            done()
        })
    })
})

describe('AskNeighborsResendStrategy#getResendResponseStream', () => {
    let nodeToNode
    let getNeighbors
    let resendStrategy
    let request

    beforeEach(async () => {
        nodeToNode = new EventEmitter()
        getNeighbors = jest.fn()
        resendStrategy = new AskNeighborsResendStrategy(nodeToNode, getNeighbors, 2, TIMEOUT)
        request = resendLastRequest
    })

    afterEach(() => {
        resendStrategy.stop()
    })

    test('if given non-local request returns empty stream', async () => {
        const responseStream = resendStrategy.getResendResponseStream(request, 'non-local')
        const streamAsArray = await waitForStreamToEnd(responseStream)
        expect(streamAsArray).toEqual([])
    })

    test('if no neighbors available returns empty stream', async () => {
        getNeighbors.mockReturnValueOnce([])
        const responseStream = resendStrategy.getResendResponseStream(request)
        const streamAsArray = await waitForStreamToEnd(responseStream)
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

        test('if forwarding request to first neighbor fails, forwards to 2nd', (done) => {
            nodeToNode.send = jest.fn()
                .mockReturnValueOnce(Promise.reject())
                .mockReturnValueOnce(Promise.resolve())

            resendStrategy.getResendResponseStream(request)

            setImmediate(() => {
                jest.runAllTimers()
                expect(nodeToNode.send).toBeCalledTimes(2)
                expect(nodeToNode.send).toBeCalledWith('neighbor-1', request)
                expect(nodeToNode.send).toBeCalledWith('neighbor-2', request)
                done()
            })
        })

        test('if forwarding request to both neighbors fails (maxTries=2) returns empty stream', async () => {
            nodeToNode.send = jest.fn()
                .mockReturnValueOnce(Promise.reject())
                .mockReturnValueOnce(Promise.reject())

            const responseStream = resendStrategy.getResendResponseStream(request)
            const streamAsArray = await waitForStreamToEnd(responseStream)

            expect(streamAsArray).toEqual([])
        })

        test('avoids forwarding request to same neighbor again', async () => {
            getNeighbors.mockClear()
            getNeighbors.mockReturnValue(['neighbor-1', 'neighbor-1', 'neighbor-1'])
            nodeToNode.send = jest.fn().mockReturnValue(Promise.reject())

            await waitForStreamToEnd(resendStrategy.getResendResponseStream(request))

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

        test('if no response within timeout, move to next neighbor', () => {
            jest.advanceTimersByTime(TIMEOUT)
            expect(nodeToNode.send).toBeCalledTimes(2)
        })

        test('if neighbor disconnects, move to next neighbor', () => {
            nodeToNode.emit(NodeToNode.events.NODE_DISCONNECTED, 'neighbor-1')
            expect(nodeToNode.send).toBeCalledTimes(2)
        })

        test('if neighbor responds with ResendResponseResending, extend timeout', () => {
            jest.advanceTimersByTime(TIMEOUT - 1)
            nodeToNode.emit(
                NodeToNode.events.RESEND_RESPONSE,
                new ControlLayer.ResendResponseResending({
                    streamId: 'streamId', streamPartition: 0, requestId: 'requestId'
                }),
                'neighbor-1'
            )
            jest.advanceTimersByTime(TIMEOUT - 1)

            expect(nodeToNode.send).toBeCalledTimes(1)
        })

        test('if neighbor responds with UnicastMessage, extend timeout', () => {
            jest.advanceTimersByTime(TIMEOUT - 1)
            nodeToNode.emit(
                NodeToNode.events.UNICAST_RECEIVED,
                new ControlLayer.UnicastMessage({
                    requestId: 'requestId', streamMessage: msg1
                }),
                'neighbor-1',
            )
            jest.advanceTimersByTime(TIMEOUT - 1)

            expect(nodeToNode.send).toBeCalledTimes(1)
        })

        test('if neighbor responds with ResendResponseNoResend, move to next neighbor', () => {
            nodeToNode.emit(
                NodeToNode.events.RESEND_RESPONSE,
                resendResponseNoResend,
                'neighbor-1'
            )
            expect(nodeToNode.send).toBeCalledTimes(2)
        })

        test('if neighbor responds with ResendResponseResent, returned stream is closed', async () => {
            nodeToNode.emit(
                NodeToNode.events.RESEND_RESPONSE,
                new ControlLayer.ResendResponseResent({
                    streamId: 'streamId', streamPartition: 0, requestId: 'requestId'
                }),
                'neighbor-1'
            )

            // eslint-disable-next-line no-underscore-dangle
            expect(responseStream._readableState.ended).toEqual(true)
            expect(nodeToNode.send).toBeCalledTimes(1) // ensure next neighbor wasn't asked
        })

        test('all UnicastMessages received from neighbor are pushed to returned stream', async () => {
            const u1 = createUnicastMessage(0)
            const u2 = createUnicastMessage(1000)
            const u3 = createUnicastMessage(11000)
            const u4 = createUnicastMessage(21000)
            const u5 = createUnicastMessage(22000)

            nodeToNode.emit(NodeToNode.events.UNICAST_RECEIVED, u1, 'neighbor-1')
            nodeToNode.emit(NodeToNode.events.UNICAST_RECEIVED, u2, 'neighbor-1')
            jest.advanceTimersByTime(TIMEOUT / 10)
            nodeToNode.emit(NodeToNode.events.UNICAST_RECEIVED, u3, 'neighbor-1')
            jest.advanceTimersByTime(TIMEOUT / 10)
            nodeToNode.emit(NodeToNode.events.UNICAST_RECEIVED, u4, 'neighbor-1')
            nodeToNode.emit(NodeToNode.events.UNICAST_RECEIVED, u5, 'neighbor-1')
            nodeToNode.emit(
                NodeToNode.events.RESEND_RESPONSE,
                new ControlLayer.ResendResponseResent({
                    streamId: 'streamId', streamPartition: 0, requestId: 'requestId'
                }),
                'neighbor-1'
            )

            const streamAsArray = await waitForStreamToEnd(responseStream)
            expect(streamAsArray).toEqual([u1, u2, u3, u4, u5])
        })
    })
})

describe('StorageNodeResendStrategy#getResendResponseStream', () => {
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
        request = resendLastRequest
    })

    afterEach(() => {
        resendStrategy.stop()
    })

    test('if given non-local request returns empty stream', async () => {
        const responseStream = resendStrategy.getResendResponseStream(request, 'non-local')
        const streamAsArray = await waitForStreamToEnd(responseStream)
        expect(streamAsArray).toEqual([])
    })

    test('if tracker not available returns empty stream', async () => {
        getTracker.mockReturnValueOnce(undefined)
        const responseStream = resendStrategy.getResendResponseStream(request)
        const streamAsArray = await waitForStreamToEnd(responseStream)
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
            expect(trackerNode.findStorageNodes).toBeCalledWith('tracker', new StreamIdAndPartition('streamId', 0))
        })

        test('if communication with tracker fails, returns empty stream', async () => {
            trackerNode.findStorageNodes = jest.fn().mockReturnValueOnce(Promise.reject())

            const responseStream = resendStrategy.getResendResponseStream(request)
            const streamAsArray = await waitForStreamToEnd(responseStream)
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
            jest.advanceTimersByTime(TIMEOUT)
            const streamAsArray = await waitForStreamToEnd(responseStream)
            expect(streamAsArray).toEqual([])
        })

        test('if tracker responds with zero storage nodes, returns empty stream', async () => {
            trackerNode.emit(
                TrackerNode.events.STORAGE_NODES_RECEIVED,
                new StorageNodesMessage(new StreamIdAndPartition('streamId', 0), [])
            )
            const streamAsArray = await waitForStreamToEnd(responseStream)
            expect(streamAsArray).toEqual([])
        })

        test('if tracker responds with storage nodes, connects to them one by one until success', (done) => {
            nodeToNode.disconnectFromNode = jest.fn()
            nodeToNode.send = jest.fn().mockReturnValue(Promise.resolve())
            nodeToNode.connectToNode = jest.fn()
                .mockReturnValueOnce(Promise.reject())
                .mockReturnValueOnce(Promise.reject())
                .mockReturnValueOnce(Promise.resolve())
                .mockReturnValueOnce(Promise.resolve())

            trackerNode.emit(
                TrackerNode.events.STORAGE_NODES_RECEIVED,
                new StorageNodesMessage(new StreamIdAndPartition('streamId', 0), [
                    'ws://storageNode-1',
                    'ws://storageNode-2',
                    'ws://storageNode-3',
                    'ws://storageNode-4'
                ])
            )

            setImmediate(() => {
                jest.runAllTimers()
                expect(nodeToNode.connectToNode).toBeCalledTimes(3)
                expect(nodeToNode.connectToNode).toBeCalledWith('ws://storageNode-1')
                expect(nodeToNode.connectToNode).toBeCalledWith('ws://storageNode-2')
                expect(nodeToNode.connectToNode).toBeCalledWith('ws://storageNode-3')
                done()
            })
        })

        test('if tracker responds with non-connectable storage nodes, returns empty stream', async () => {
            nodeToNode.connectToNode = jest.fn()
                .mockReturnValue(Promise.reject())

            trackerNode.emit(
                TrackerNode.events.STORAGE_NODES_RECEIVED,
                new StorageNodesMessage(new StreamIdAndPartition('streamId', 0), [
                    'ws://storageNode-1',
                    'ws://storageNode-2'
                ])
            )

            const streamAsArray = await waitForStreamToEnd(responseStream)
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

        const emitTrackerResponse = () => {
            trackerNode.emit(
                TrackerNode.events.STORAGE_NODES_RECEIVED,
                new StorageNodesMessage(new StreamIdAndPartition('streamId', 0), ['ws://storageNode'])
            )
            return new Promise((resolve) => setImmediate(resolve))
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

            const streamAsArray = await waitForStreamToEnd(responseStream)
            expect(streamAsArray).toEqual([])
            expect(nodeToNode.send).toBeCalledTimes(1) // sanity check
        })

        test('if storage node disconnects, returns empty stream', async () => {
            nodeToNode.send.mockReturnValue(Promise.resolve())

            await emitTrackerResponse()
            nodeToNode.emit(NodeToNode.events.NODE_DISCONNECTED, 'storageNode')

            const streamAsArray = await waitForStreamToEnd(responseStream)
            expect(streamAsArray).toEqual([])
            expect(nodeToNode.send).toBeCalledTimes(1) // sanity check
        })
    })

    describe('after forwarding request to storage node', () => {
        let responseStream

        beforeEach((done) => {
            getTracker.mockReturnValue(['tracker'])
            trackerNode.findStorageNodes = () => Promise.resolve()
            nodeToNode.connectToNode = () => Promise.resolve('storageNode')
            nodeToNode.send = jest.fn().mockResolvedValue(null)
            nodeToNode.disconnectFromNode = jest.fn()

            responseStream = resendStrategy.getResendResponseStream(request)

            setImmediate(() => { // wait for this.trackerNode.findStorageNodes(...)
                trackerNode.emit(
                    TrackerNode.events.STORAGE_NODES_RECEIVED,
                    new StorageNodesMessage(new StreamIdAndPartition('streamId', 0), ['ws://storageNode'])
                )
                done()
            })
        })

        test('if no response within timeout, returns empty stream', async () => {
            jest.advanceTimersByTime(TIMEOUT)

            // eslint-disable-next-line no-underscore-dangle
            expect(responseStream._readableState.ended).toEqual(true)
            const streamAsArray = await waitForStreamToEnd(responseStream)
            expect(streamAsArray).toEqual([])
        })

        test('if storage node responds with ResendResponseResending, extend timeout', () => {
            jest.advanceTimersByTime(TIMEOUT - 1)
            nodeToNode.emit(NodeToNode.events.RESEND_RESPONSE, resendResponseResending, 'storageNode')
            jest.advanceTimersByTime(TIMEOUT - 1)

            // eslint-disable-next-line no-underscore-dangle
            expect(responseStream._readableState.ended).toEqual(false)
        })

        test('if storage node responds with UnicastMessage, extend timeout', () => {
            jest.advanceTimersByTime(TIMEOUT - 1)
            nodeToNode.emit(
                NodeToNode.events.UNICAST_RECEIVED,
                new ControlLayer.UnicastMessage({
                    requestId: 'requestId', streamMessage: msg1
                }),
                'storageNode'
            )
            jest.advanceTimersByTime(TIMEOUT - 1)

            // eslint-disable-next-line no-underscore-dangle
            expect(responseStream._readableState.ended).toEqual(false)
        })

        test('if storage node responds with ResendResponseNoResend, returned stream is closed', () => {
            nodeToNode.emit(NodeToNode.events.RESEND_RESPONSE, resendResponseNoResend, 'storageNode')
            // eslint-disable-next-line no-underscore-dangle
            expect(responseStream._readableState.ended).toEqual(true)
        })

        test('all UnicastMessages received from storage node are pushed to returned stream', async () => {
            const u1 = createUnicastMessage(0)
            const u2 = createUnicastMessage(1000)
            const u3 = createUnicastMessage(11000)
            const u4 = createUnicastMessage(21000)
            const u5 = createUnicastMessage(22000)

            nodeToNode.emit(NodeToNode.events.UNICAST_RECEIVED, u1, 'storageNode')
            nodeToNode.emit(NodeToNode.events.UNICAST_RECEIVED, u2, 'storageNode')
            jest.advanceTimersByTime(TIMEOUT / 10)
            nodeToNode.emit(NodeToNode.events.UNICAST_RECEIVED, u3, 'storageNode')
            jest.advanceTimersByTime(TIMEOUT / 10)
            nodeToNode.emit(NodeToNode.events.UNICAST_RECEIVED, u4, 'storageNode')
            nodeToNode.emit(NodeToNode.events.UNICAST_RECEIVED, u5, 'storageNode')
            nodeToNode.emit(NodeToNode.events.RESEND_RESPONSE, resendResponseResent, 'storageNode')

            const streamAsArray = await waitForStreamToEnd(responseStream)
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
                    new StorageNodesMessage(new StreamIdAndPartition('streamId', 0), ['ws://storageNode'])
                )

                // Causes the stream to end. Other ways to end are a) failing to forward request and b) timeout. All of
                // them have same handling logic so testing only one case here.
                setImmediate(() => {
                    nodeToNode.emit(NodeToNode.events.RESEND_RESPONSE, resendResponseResent, 'storageNode')
                })
            })
        })

        test('if not (previously) subscribed to storage node, disconnect from storage node', async () => {
            isSubscribedTo.mockReturnValue(false)
            await waitForStreamToEnd(responseStream)
            expect(nodeToNode.disconnectFromNode).toBeCalledTimes(1)
            expect(nodeToNode.disconnectFromNode).toBeCalledWith('storageNode')
        })

        test('if (previously) subscribed to storage node, do not disconnect from storage node', async () => {
            isSubscribedTo.mockReturnValue(true)
            await waitForStreamToEnd(responseStream)
            expect(nodeToNode.disconnectFromNode).toBeCalledTimes(0)
        })
    })
})

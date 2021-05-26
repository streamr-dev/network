import { EventEmitter } from 'events'

import { MessageLayer, ControlLayer, TrackerLayer } from 'streamr-client-protocol'
import { waitForStreamToEnd, toReadableStream } from 'streamr-test-utils'

import { LocalResendStrategy, ForeignResendStrategy } from '../../src/resend/resendStrategies'
import { StreamIdAndPartition } from '../../src/identifiers'
import { Event as NodeToNodeEvent, NodeToNode } from '../../src/protocol/NodeToNode'
import { Event as TrackerNodeEvent, TrackerNode } from '../../src/protocol/TrackerNode'
import { Readable } from 'stream'

const { StreamMessage, MessageID, MessageRef } = MessageLayer
const { ResendLastRequest, ResendFromRequest, ResendRangeRequest } = ControlLayer

jest.useFakeTimers()

const TIMEOUT = 10000

const resendLastRequest = new ResendLastRequest({
    streamId: 'streamId',
    streamPartition: 0,
    requestId: 'requestId',
    numberLast: 10,
    sessionToken: null
})

const resendFromRequest = new ResendFromRequest({
    streamId: 'streamId',
    streamPartition: 0,
    requestId: 'requestId',
    fromMsgRef: new MessageRef(1555555555555, 0),
    publisherId: 'publisherId',
    sessionToken: null
})

const resendRangeRequest = new ResendRangeRequest({
    streamId: 'streamId',
    streamPartition: 0,
    requestId: 'requestId',
    fromMsgRef: new MessageRef(1555555555555, 0),
    toMsgRef: new MessageRef(1555555555555, 1000),
    publisherId: 'publisherId',
    msgChainId: 'msgChainId',
    sessionToken: null
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

describe('LocalResendStrategy#getResendResponseStream', () => {
    let storage: any
    let resendStrategy: LocalResendStrategy

    beforeEach(async () => {
        storage = {}
        resendStrategy = new LocalResendStrategy(storage)
    })

    test('on receiving ResendLastRequest, storage#requestLast is invoked', async () => {
        storage.requestLast = jest.fn().mockReturnValueOnce(toReadableStream())

        resendStrategy.getResendResponseStream(resendLastRequest)

        expect(storage.requestLast.mock.calls).toEqual([
            [resendLastRequest.streamId, resendLastRequest.streamPartition, resendLastRequest.numberLast]
        ])
    })

    test('on receiving ResendFromRequest, storage#requestFrom is invoked', async () => {
        storage.requestFrom = jest.fn().mockReturnValueOnce(toReadableStream())

        resendStrategy.getResendResponseStream(resendFromRequest)

        expect(storage.requestFrom.mock.calls).toEqual([[
            resendFromRequest.streamId, resendFromRequest.streamPartition,
            resendFromRequest.fromMsgRef.timestamp, resendFromRequest.fromMsgRef.sequenceNumber,
            resendFromRequest.publisherId, null // TODO: msgChainId is not used, remove on NET-143
        ]])
    })

    test('on receiving ResendRangeRequest, storage#requestRange is invoked', async () => {
        storage.requestRange = jest.fn().mockReturnValueOnce(toReadableStream())

        resendStrategy.getResendResponseStream(resendRangeRequest)

        expect(storage.requestRange.mock.calls).toEqual([[
            resendRangeRequest.streamId, resendRangeRequest.streamPartition,
            resendRangeRequest.fromMsgRef.timestamp, resendRangeRequest.fromMsgRef.sequenceNumber,
            resendRangeRequest.toMsgRef.timestamp, resendRangeRequest.toMsgRef.sequenceNumber,
            resendRangeRequest.publisherId, resendRangeRequest.msgChainId
        ]])
    })

    test('data of storage stream are transformed into UnicastMessages for response stream', async () => {
        storage.requestLast = jest.fn().mockReturnValueOnce(toReadableStream(msg1, msg2))

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
        const storageStream = toReadableStream()
        storage.requestRange = jest.fn().mockReturnValueOnce(storageStream)

        const responseStream = resendStrategy.getResendResponseStream(resendRangeRequest)

        responseStream.destroy()

        setImmediate(() => {
            expect(storageStream.destroyed).toEqual(true)
            done()
        })
    })
})

describe('ForeignResendStrategy#getResendResponseStream', () => {
    let nodeToNode: NodeToNode
    let trackerNode: TrackerNode
    let getTracker: any
    let isSubscribedTo: any
    let resendStrategy: ForeignResendStrategy
    let request: any

    beforeEach(async () => {
        nodeToNode = new EventEmitter() as any
        trackerNode = new EventEmitter() as any
        getTracker = jest.fn()
        isSubscribedTo = jest.fn()
        resendStrategy = new ForeignResendStrategy(trackerNode as any, nodeToNode, getTracker, isSubscribedTo, TIMEOUT)
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
            trackerNode.sendStorageNodesRequest = jest.fn().mockReturnValueOnce(Promise.resolve())

            resendStrategy.getResendResponseStream(request)

            expect(trackerNode.sendStorageNodesRequest).toBeCalledTimes(1)
            expect(trackerNode.sendStorageNodesRequest).toBeCalledWith('tracker', new StreamIdAndPartition('streamId', 0))
        })

        test('if communication with tracker fails, returns empty stream', async () => {
            trackerNode.sendStorageNodesRequest = jest.fn().mockReturnValueOnce(Promise.reject())

            const responseStream = resendStrategy.getResendResponseStream(request)
            const streamAsArray = await waitForStreamToEnd(responseStream)
            expect(streamAsArray).toEqual([])
        })
    })

    describe('after sending storage node query to tracker', () => {
        let responseStream: Readable

        beforeEach(() => {
            getTracker.mockReturnValue(['tracker'])
            trackerNode.sendStorageNodesRequest = jest.fn().mockReturnValue(Promise.resolve())
            responseStream = resendStrategy.getResendResponseStream(request)
        })

        test('if tracker does not respond within timeout, returns empty stream', async () => {
            jest.advanceTimersByTime(TIMEOUT)
            const streamAsArray = await waitForStreamToEnd(responseStream)
            expect(streamAsArray).toEqual([])
        })

        test('if tracker responds with zero storage nodes, returns empty stream', async () => {
            trackerNode.emit(
                TrackerNodeEvent.STORAGE_NODES_RESPONSE_RECEIVED,
                new TrackerLayer.StorageNodesResponse({
                    requestId: 'requestId',
                    streamId: 'streamId',
                    streamPartition: 0,
                    nodeIds: []
                })
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
                TrackerNodeEvent.STORAGE_NODES_RESPONSE_RECEIVED,
                new TrackerLayer.StorageNodesResponse({
                    requestId: 'requestId',
                    streamId: 'streamId',
                    streamPartition: 0,
                    nodeIds: [
                        'storageNode-1',
                        'storageNode-2',
                        'storageNode-3',
                        'storageNode-4'
                    ]
                }),
                'tracker'
            )
            setImmediate(() => {
                jest.runAllTimers()
                expect(nodeToNode.connectToNode).toBeCalledTimes(3)
                expect(nodeToNode.connectToNode).toBeCalledWith('storageNode-1', 'tracker')
                expect(nodeToNode.connectToNode).toBeCalledWith('storageNode-2', 'tracker')
                expect(nodeToNode.connectToNode).toBeCalledWith('storageNode-3', 'tracker')
                done()
            })
        })

        test('if tracker responds with non-connectable storage nodes, returns empty stream', async () => {
            nodeToNode.connectToNode = jest.fn()
                .mockReturnValue(Promise.reject())

            trackerNode.emit(
                TrackerNodeEvent.STORAGE_NODES_RESPONSE_RECEIVED,
                new TrackerLayer.StorageNodesResponse({
                    requestId: 'requestId',
                    streamId: 'streamId',
                    streamPartition: 0,
                    nodeIds: [
                        'storageNode-1',
                        'storageNode-2'
                    ]
                })
            )

            const streamAsArray = await waitForStreamToEnd(responseStream)
            expect(streamAsArray).toEqual([])
        })
    })

    describe('after connecting to a storage node', () => {
        let responseStream: Readable

        beforeEach(() => {
            getTracker.mockReturnValue(['tracker'])
            trackerNode.sendStorageNodesRequest = () => Promise.resolve() as any
            nodeToNode.connectToNode = () => Promise.resolve('storageNode')
            nodeToNode.send = jest.fn()
            nodeToNode.disconnectFromNode = jest.fn()

            responseStream = resendStrategy.getResendResponseStream(request)
        })

        const emitTrackerResponse = () => {
            trackerNode.emit(
                TrackerNodeEvent.STORAGE_NODES_RESPONSE_RECEIVED,
                new TrackerLayer.StorageNodesResponse({
                    requestId: 'requestId',
                    streamId: 'streamId',
                    streamPartition: 0,
                    nodeIds: ['storageNode']
                })
            )
            return new Promise((resolve) => setImmediate(resolve))
        }

        test('forwards request to storage node', async () => {
            (nodeToNode.send as any).mockReturnValue(Promise.resolve())

            await emitTrackerResponse()

            expect(nodeToNode.send).toBeCalledTimes(1)
            expect(nodeToNode.send).toBeCalledWith('storageNode', request)
        })

        test('if forwarding request to storage node fails, returns empty stream', async () => {
            (nodeToNode.send as any).mockReturnValue(Promise.reject())

            await emitTrackerResponse()

            const streamAsArray = await waitForStreamToEnd(responseStream)
            expect(streamAsArray).toEqual([])
            expect(nodeToNode.send).toBeCalledTimes(1) // sanity check
        })

        test('if storage node disconnects, returns empty stream', async () => {
            (nodeToNode.send as any).mockReturnValue(Promise.resolve())

            await emitTrackerResponse()
            nodeToNode.emit(NodeToNodeEvent.NODE_DISCONNECTED, 'storageNode')

            const streamAsArray = await waitForStreamToEnd(responseStream)
            expect(streamAsArray).toEqual([])
            expect(nodeToNode.send).toBeCalledTimes(1) // sanity check
        })
    })

    describe('after forwarding request to storage node', () => {
        let responseStream: Readable

        beforeEach((done) => {
            getTracker.mockReturnValue(['tracker'])
            trackerNode.sendStorageNodesRequest = () => Promise.resolve() as any
            nodeToNode.connectToNode = () => Promise.resolve('storageNode')
            nodeToNode.send = jest.fn().mockResolvedValue(null)
            nodeToNode.disconnectFromNode = jest.fn()

            responseStream = resendStrategy.getResendResponseStream(request)

            setImmediate(() => { // wait for this.trackerNode.sendStorageNodesRequest(...)
                trackerNode.emit(
                    TrackerNodeEvent.STORAGE_NODES_RESPONSE_RECEIVED,
                    new TrackerLayer.StorageNodesResponse({
                        requestId: 'requestId',
                        streamId: 'streamId',
                        streamPartition: 0,
                        nodeIds: ['storageNode']
                    })
                )
                done()
            })
        })

        test('if no response within timeout, returns empty stream', async () => {
            jest.advanceTimersByTime(TIMEOUT)

            // @ts-expect-error private field
            // eslint-disable-next-line no-underscore-dangle
            expect(responseStream._readableState.ended).toEqual(true)
            const streamAsArray = await waitForStreamToEnd(responseStream)
            expect(streamAsArray).toEqual([])
        })

        test('if storage node responds with ResendResponseResending, extend timeout', () => {
            jest.advanceTimersByTime(TIMEOUT - 1)
            nodeToNode.emit(NodeToNodeEvent.RESEND_RESPONSE, resendResponseResending, 'storageNode')
            jest.advanceTimersByTime(TIMEOUT - 1)

            // @ts-expect-error private field
            // eslint-disable-next-line no-underscore-dangle
            expect(responseStream._readableState.ended).toEqual(false)
        })

        test('if storage node responds with UnicastMessage, extend timeout', () => {
            jest.advanceTimersByTime(TIMEOUT - 1)
            nodeToNode.emit(
                NodeToNodeEvent.UNICAST_RECEIVED,
                new ControlLayer.UnicastMessage({
                    requestId: 'requestId', streamMessage: msg1
                }),
                'storageNode'
            )
            jest.advanceTimersByTime(TIMEOUT - 1)

            // @ts-expect-error private field
            // eslint-disable-next-line no-underscore-dangle
            expect(responseStream._readableState.ended).toEqual(false)
        })

        test('if storage node responds with ResendResponseNoResend, returned stream is closed', () => {
            nodeToNode.emit(NodeToNodeEvent.RESEND_RESPONSE, resendResponseNoResend, 'storageNode')
            // @ts-expect-error private field
            // eslint-disable-next-line no-underscore-dangle
            expect(responseStream._readableState.ended).toEqual(true)
        })

        test('all UnicastMessages received from storage node are pushed to returned stream', async () => {
            const u1 = createUnicastMessage(0)
            const u2 = createUnicastMessage(1000)
            const u3 = createUnicastMessage(11000)
            const u4 = createUnicastMessage(21000)
            const u5 = createUnicastMessage(22000)

            nodeToNode.emit(NodeToNodeEvent.UNICAST_RECEIVED, u1, 'storageNode')
            nodeToNode.emit(NodeToNodeEvent.UNICAST_RECEIVED, u2, 'storageNode')
            jest.advanceTimersByTime(TIMEOUT / 10)
            nodeToNode.emit(NodeToNodeEvent.UNICAST_RECEIVED, u3, 'storageNode')
            jest.advanceTimersByTime(TIMEOUT / 10)
            nodeToNode.emit(NodeToNodeEvent.UNICAST_RECEIVED, u4, 'storageNode')
            nodeToNode.emit(NodeToNodeEvent.UNICAST_RECEIVED, u5, 'storageNode')
            nodeToNode.emit(NodeToNodeEvent.RESEND_RESPONSE, resendResponseResent, 'storageNode')

            const streamAsArray = await waitForStreamToEnd(responseStream)
            expect(streamAsArray).toEqual([u1, u2, u3, u4, u5])
        })
    })

    describe('after connecting to storage node and on response stream closed', () => {
        let responseStream: Readable

        beforeEach(() => {
            getTracker.mockReturnValue(['tracker'])
            trackerNode.sendStorageNodesRequest = () => Promise.resolve() as any
            nodeToNode.connectToNode = () => Promise.resolve('storageNode')
            nodeToNode.send = () => Promise.resolve() as any
            nodeToNode.disconnectFromNode = jest.fn()

            responseStream = resendStrategy.getResendResponseStream(request)

            setImmediate(() => {
                trackerNode.emit(
                    TrackerNodeEvent.STORAGE_NODES_RESPONSE_RECEIVED,
                    new TrackerLayer.StorageNodesResponse({
                        requestId: 'requestId',
                        streamId: 'streamId',
                        streamPartition: 0,
                        nodeIds: ['storageNode']
                    })
                )

                // Causes the stream to end. Other ways to end are a) failing to forward request and b) timeout. All of
                // them have same handling logic so testing only one case here.
                setImmediate(() => {
                    nodeToNode.emit(NodeToNodeEvent.RESEND_RESPONSE, resendResponseResent, 'storageNode')
                })
            })
        })

        test('if not (previously) subscribed to storage node, disconnect from storage node', async () => {
            isSubscribedTo.mockReturnValue(false)
            await waitForStreamToEnd(responseStream)
            expect(nodeToNode.disconnectFromNode).toBeCalledTimes(1)
            expect(nodeToNode.disconnectFromNode).toBeCalledWith('storageNode', 'resend done')
        })

        test('if (previously) subscribed to storage node, do not disconnect from storage node', async () => {
            isSubscribedTo.mockReturnValue(true)
            await waitForStreamToEnd(responseStream)
            expect(nodeToNode.disconnectFromNode).toBeCalledTimes(0)
        })
    })
})

const { EventEmitter } = require('events')
const intoStream = require('into-stream')
const { AskNeighborsResendStrategy, StorageResendStrategy } = require('../../src/logic/resendStrategies')
const ResendLastRequest = require('../../src/messages/ResendLastRequest')
const ResendFromRequest = require('../../src/messages/ResendFromRequest')
const ResendRangeRequest = require('../../src/messages/ResendRangeRequest')
const ResendResponseNoResend = require('../../src/messages/ResendResponseNoResend')
const ResendResponseResending = require('../../src/messages/ResendResponseResending')
const ResendResponseResent = require('../../src/messages/ResendResponseResent')
const UnicastMessage = require('../../src/messages/UnicastMessage')
const { wait } = require('../util')
const { MessageID, MessageReference, StreamID } = require('../../src/identifiers')
const NodeToNode = require('../../src/protocol/NodeToNode')

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

        afterEach(() => {
            resendStrategy.stop()
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

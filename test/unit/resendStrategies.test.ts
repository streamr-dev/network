import { MessageLayer, ControlLayer } from 'streamr-client-protocol'
import { waitForStreamToEnd, toReadableStream } from 'streamr-test-utils'

import { LocalResendStrategy } from '../../src/resend/resendStrategies'

const { StreamMessage, MessageID, MessageRef } = MessageLayer
const { ResendLastRequest, ResendFromRequest, ResendRangeRequest } = ControlLayer

jest.useFakeTimers()

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

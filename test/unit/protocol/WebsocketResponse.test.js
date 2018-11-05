/* eslint-disable no-new */
import assert from 'assert'
import WebsocketResponse from '../../../src/protocol/WebsocketResponse'
import StreamMessage from '../../../src/protocol/StreamMessage'
import StreamAndPartition from '../../../src/protocol/StreamAndPartition'
import ResendResponsePayload from '../../../src/protocol/ResendResponsePayload'
import BroadcastMessage from '../../../src/protocol/BroadcastMessage'
import UnicastMessage from '../../../src/protocol/UnicastMessage'
import SubscribeResponse from '../../../src/protocol/SubscribeResponse'
import UnsubscribeResponse from '../../../src/protocol/UnsubscribeResponse'
import ResendResponseResending from '../../../src/protocol/ResendResponseResending'
import ResendResponseResent from '../../../src/protocol/ResendResponseResent'
import ResendResponseNoResend from '../../../src/protocol/ResendResponseNoResend'
import ErrorResponse from '../../../src/protocol/ErrorResponse'
import ErrorPayload from '../../../src/protocol/ErrorPayload'
import ValidationError from '../../../src/errors/ValidationError'

const examplesByType = {
    '0': [0, 0, null, [28, 'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0,
        941516902, 941499898, StreamMessage.CONTENT_TYPES.JSON, '{"valid": "json"}']],
    '1': [0, 1, 'subId', [28, 'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0,
        941516902, 941499898, StreamMessage.CONTENT_TYPES.JSON, '{"valid": "json"}']],
    '2': [0, 2, null, {
        stream: 'id',
        partition: 0,
    }],
    '3': [0, 3, null, {
        stream: 'id',
        partition: 0,
    }],
    '4': [0, 4, null, {
        stream: 'id',
        partition: 0,
        sub: 'subId',
    }],
    '5': [0, 5, null, {
        stream: 'id',
        partition: 0,
        sub: 'subId',
    }],
    '6': [0, 6, null, {
        stream: 'id',
        partition: 0,
        sub: 'subId',
    }],
    '7': [0, 7, null, {
        error: 'foo',
    }],
}

describe('WebsocketResponse', () => {
    describe('version 0', () => {
        describe('deserialize', () => {
            it('BroadcastMessage', () => {
                const result = WebsocketResponse.deserialize(JSON.stringify(examplesByType[0]))
                assert(result instanceof BroadcastMessage)
                assert(result.payload instanceof StreamMessage)
            })

            it('UnicastMessage', () => {
                const result = WebsocketResponse.deserialize(JSON.stringify(examplesByType[1]))
                assert(result instanceof UnicastMessage)
                assert(result.payload instanceof StreamMessage)
                assert.equal(result.subId, 'subId')
            })

            it('SubscribeResponse', () => {
                const result = WebsocketResponse.deserialize(JSON.stringify(examplesByType[2]))
                assert(result instanceof SubscribeResponse)
                assert(result.payload instanceof StreamAndPartition)
            })

            it('UnsubscribeResponse', () => {
                const result = WebsocketResponse.deserialize(JSON.stringify(examplesByType[3]))
                assert(result instanceof UnsubscribeResponse)
                assert(result.payload instanceof StreamAndPartition)
            })

            it('ResendResponseResending', () => {
                const result = WebsocketResponse.deserialize(JSON.stringify(examplesByType[4]))
                assert(result instanceof ResendResponseResending)
                assert(result.payload instanceof ResendResponsePayload)
                assert.equal(result.payload.subId, 'subId')
            })

            it('ResendResponseResent', () => {
                const result = WebsocketResponse.deserialize(JSON.stringify(examplesByType[5]))
                assert(result instanceof ResendResponseResent)
                assert(result.payload instanceof ResendResponsePayload)
                assert.equal(result.payload.subId, 'subId')
            })

            it('ResendResponseNoResend', () => {
                const result = WebsocketResponse.deserialize(JSON.stringify(examplesByType[6]))
                assert(result instanceof ResendResponseNoResend)
                assert(result.payload instanceof ResendResponsePayload)
                assert.equal(result.payload.subId, 'subId')
            })

            it('ErrorResponse', () => {
                const result = WebsocketResponse.deserialize(JSON.stringify(examplesByType[7]))
                assert(result instanceof ErrorResponse)
                assert(result.payload instanceof ErrorPayload)
                assert.equal(result.payload.error, 'foo')
            })
        })

        describe('serialize', () => {
            let serialized
            beforeEach(() => {
                serialized = null
            })
            afterEach(() => {
                assert(typeof serialized === 'string')
            })

            it('correctly serializes broadcast messages', () => {
                serialized = WebsocketResponse.deserialize(examplesByType[0]).serialize()
                assert.deepEqual(examplesByType[0], JSON.parse(serialized))
            })

            it('correctly serializes unicast messages', () => {
                serialized = WebsocketResponse.deserialize(examplesByType[1]).serialize()
                assert.deepEqual(examplesByType[1], JSON.parse(serialized))
            })

            it('correctly serializes subscribed messages', () => {
                serialized = WebsocketResponse.deserialize(examplesByType[2]).serialize()
                assert.deepEqual(examplesByType[2], JSON.parse(serialized))
            })

            it('correctly serializes unsubscribed messages', () => {
                serialized = WebsocketResponse.deserialize(examplesByType[3]).serialize()
                assert.deepEqual(examplesByType[3], JSON.parse(serialized))
            })

            it('correctly serializes resending messages', () => {
                serialized = WebsocketResponse.deserialize(examplesByType[4]).serialize()
                assert.deepEqual(examplesByType[4], JSON.parse(serialized))
            })

            it('correctly serializes resent messages', () => {
                serialized = WebsocketResponse.deserialize(examplesByType[5]).serialize()
                assert.deepEqual(examplesByType[5], JSON.parse(serialized))
            })

            it('correctly serializes no_resend messages', () => {
                serialized = WebsocketResponse.deserialize(examplesByType[6]).serialize()
                assert.deepEqual(examplesByType[6], JSON.parse(serialized))
            })

            it('correctly serializes error messages', () => {
                serialized = WebsocketResponse.deserialize(examplesByType[7]).serialize()
                assert.deepEqual(examplesByType[7], JSON.parse(serialized))
            })
        })
    })

    describe('constructor', () => {
        it('throws if conflicting payload is passed', () => {
            assert.throws(() => {
                new WebsocketResponse(0, StreamAndPartition.deserialize(examplesByType[2][3]))
            }, (err) => err instanceof ValidationError)
        })
    })
})

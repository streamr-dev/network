import assert from 'assert'
import MessageFromServer from '../../../src/protocol/MessageFromServer'
import StreamMessage from '../../../src/protocol/StreamMessage'
import BroadcastMessage from '../../../src/protocol/BroadcastMessage'
import UnicastMessage from '../../../src/protocol/UnicastMessage'
import SubscribeResponse from '../../../src/protocol/SubscribeResponse'
import UnsubscribeResponse from '../../../src/protocol/UnsubscribeResponse'
import ResendResponseResending from '../../../src/protocol/ResendResponseResending'
import ResendResponseResent from '../../../src/protocol/ResendResponseResent'
import ResendResponseNoResend from '../../../src/protocol/ResendResponseNoResend'
import ErrorResponse from '../../../src/protocol/ErrorResponse'

describe('MessageFromServer', () => {
    describe('version 0', () => {
        describe('deserialize', () => {
            it('correctly parses broadcast messages', () => {
                const msg = [0, BroadcastMessage.getMessageType(), null, [28, 'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0,
                    941516902, 941499898, StreamMessage.CONTENT_TYPES.JSON, '{"valid": "json"}']]

                const result = MessageFromServer.deserialize(JSON.stringify(msg))

                assert(result instanceof MessageFromServer)
                assert(result.payload instanceof BroadcastMessage)
            })

            it('correctly parses unicast messages', () => {
                const msg = [0, UnicastMessage.getMessageType(), 'subId', [28, 'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0,
                    941516902, 941499898, StreamMessage.CONTENT_TYPES.JSON, '{"valid": "json"}']]

                const result = MessageFromServer.deserialize(JSON.stringify(msg))

                assert(result instanceof MessageFromServer)
                assert(result.payload instanceof UnicastMessage)
                assert.equal(result.subId, 'subId')
            })

            it('correctly parses subscribed messages', () => {
                const msg = [0, SubscribeResponse.getMessageType(), 'subId', {
                    stream: 'id',
                    partition: 0,
                }]

                const result = MessageFromServer.deserialize(JSON.stringify(msg))

                assert(result instanceof MessageFromServer)
                assert(result.payload instanceof SubscribeResponse)
                assert.equal(result.subId, 'subId')
            })

            it('correctly parses unsubscribed messages', () => {
                const msg = [0, UnsubscribeResponse.getMessageType(), 'subId', {
                    stream: 'id',
                    partition: 0,
                }]

                const result = MessageFromServer.deserialize(JSON.stringify(msg))

                assert(result instanceof MessageFromServer)
                assert(result.payload instanceof UnsubscribeResponse)
                assert.equal(result.subId, 'subId')
            })

            it('correctly parses resending messages', () => {
                const msg = [0, ResendResponseResending.getMessageType(), 'subId', {
                    stream: 'id',
                    partition: 0,
                    sub: 'subId',
                }]

                const result = MessageFromServer.deserialize(JSON.stringify(msg))

                assert(result instanceof MessageFromServer)
                assert(result.payload instanceof ResendResponseResending)
                assert.equal(result.subId, 'subId')
            })

            it('correctly parses resent messages', () => {
                const msg = [0, ResendResponseResent.getMessageType(), 'subId', {
                    stream: 'id',
                    partition: 0,
                    sub: 'subId',
                }]

                const result = MessageFromServer.deserialize(JSON.stringify(msg))

                assert(result instanceof MessageFromServer)
                assert(result.payload instanceof ResendResponseResent)
                assert.equal(result.subId, 'subId')
            })

            it('correctly parses no_resend messages', () => {
                const msg = [0, ResendResponseNoResend.getMessageType(), 'subId', {
                    stream: 'id',
                    partition: 0,
                    sub: 'subId',
                }]

                const result = MessageFromServer.deserialize(JSON.stringify(msg))

                assert(result instanceof MessageFromServer)
                assert(result.payload instanceof ResendResponseNoResend)
                assert.equal(result.subId, 'subId')
            })

            it('correctly parses error messages', () => {
                const msg = [0, ErrorResponse.getMessageType(), null, {
                    error: 'foo',
                }]

                const result = MessageFromServer.deserialize(JSON.stringify(msg))

                assert(result instanceof MessageFromServer)
                assert(result.payload instanceof ErrorResponse)
            })
        })

        describe('serialize', () => {
            it('correctly serializes broadcast messages', () => {
                const msg = [0, BroadcastMessage.getMessageType(), null, [28, 'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0,
                    941516902, 941499898, StreamMessage.CONTENT_TYPES.JSON, '{"valid": "json"}']]

                const serialized = new MessageFromServer(BroadcastMessage.deserialize(msg[3])).serialize()

                assert(typeof serialized === 'string')
                assert.deepEqual(msg, JSON.parse(serialized))
            })

            it('correctly serializes unicast messages', () => {
                const msg = [0, UnicastMessage.getMessageType(), 'subId', [28, 'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0,
                    941516902, 941499898, StreamMessage.CONTENT_TYPES.JSON, '{"valid": "json"}']]

                const serialized = new MessageFromServer(
                    UnicastMessage.deserialize(msg[3]),
                    'subId',
                ).serialize()

                assert(typeof serialized === 'string')
                assert.deepEqual(msg, JSON.parse(serialized))
            })

            it('correctly serializes subscribed messages', () => {
                const msg = [0, SubscribeResponse.getMessageType(), 'subId', {
                    stream: 'id',
                    partition: 0,
                }]

                const serialized = new MessageFromServer(
                    SubscribeResponse.deserialize(msg[3]),
                    'subId',
                ).serialize()

                assert(typeof serialized === 'string')
                assert.deepEqual(msg, JSON.parse(serialized))
            })

            it('correctly serializes unsubscribed messages', () => {
                const msg = [0, UnsubscribeResponse.getMessageType(), 'subId', {
                    stream: 'id',
                    partition: 0,
                }]

                const serialized = new MessageFromServer(
                    UnsubscribeResponse.deserialize(msg[3]),
                    'subId',
                ).serialize()

                assert(typeof serialized === 'string')
                assert.deepEqual(msg, JSON.parse(serialized))
            })

            it('correctly serializes resending messages', () => {
                const msg = [0, ResendResponseResending.getMessageType(), 'subId', {
                    stream: 'id',
                    partition: 0,
                    sub: 'subId',
                }]

                const serialized = new MessageFromServer(
                    ResendResponseResending.deserialize(msg[3]),
                    'subId',
                ).serialize()

                assert(typeof serialized === 'string')
                assert.deepEqual(msg, JSON.parse(serialized))
            })

            it('correctly serializes resent messages', () => {
                const msg = [0, ResendResponseResent.getMessageType(), 'subId', {
                    stream: 'id',
                    partition: 0,
                    sub: 'subId',
                }]

                const serialized = new MessageFromServer(
                    ResendResponseResent.deserialize(msg[3]),
                    'subId',
                ).serialize()

                assert(typeof serialized === 'string')
                assert.deepEqual(msg, JSON.parse(serialized))
            })

            it('correctly serializes no_resend messages', () => {
                const msg = [0, ResendResponseNoResend.getMessageType(), 'subId', {
                    stream: 'id',
                    partition: 0,
                    sub: 'subId',
                }]

                const serialized = new MessageFromServer(
                    ResendResponseNoResend.deserialize(msg[3]),
                    'subId',
                ).serialize()

                assert(typeof serialized === 'string')
                assert.deepEqual(msg, JSON.parse(serialized))
            })

            it('correctly serializes error messages', () => {
                const msg = [0, ErrorResponse.getMessageType(), null, {
                    error: 'foo',
                }]

                const serialized = new MessageFromServer(ErrorResponse.deserialize(msg[3])).serialize()

                assert(typeof serialized === 'string')
                assert.deepEqual(msg, JSON.parse(serialized))
            })
        })
    })
})

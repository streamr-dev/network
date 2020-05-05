import assert from 'assert'

import BroadcastMessageV1 from '../../../../src/protocol/control_layer/broadcast_message/BroadcastMessageV1'
import StreamMessage from '../../../../src/protocol/message_layer/StreamMessage'
import StreamMessageV30 from '../../../../src/protocol/message_layer/StreamMessageV30'
import StreamMessageFactory from '../../../../src/protocol/message_layer/StreamMessageFactory'

describe('BroadcastMessageV1', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            const arr = [[30, ['streamId', 0, 1529549961116, 0, 'address', 'msg-chain-id'],
                [1529549961000, 0], StreamMessage.CONTENT_TYPES.MESSAGE, '{"valid": "json"}', StreamMessage.SIGNATURE_TYPES.ETH, 'signature']]
            const streamMsg = StreamMessageFactory.deserialize(arr[0])
            const result = new BroadcastMessageV1(streamMsg)
            assert(result.streamMessage instanceof StreamMessageV30)
        })
    })
    describe('serialize', () => {
        describe('serialize version 1', () => {
            let broadcastMessage
            let expectedPayloadArray
            let serialized
            beforeEach(() => {
                const streamMessageArray = [30, ['streamId', 0, 1529549961116, 0, 'address', 'msg-chain-id'], [1529549961000, 0],
                    StreamMessage.CONTENT_TYPES.MESSAGE, '{"valid": "json"}', StreamMessage.SIGNATURE_TYPES.ETH, 'signature']
                broadcastMessage = new BroadcastMessageV1(StreamMessageFactory.deserialize(streamMessageArray))
            })
            afterEach(() => {
                const arr = [1, 0, expectedPayloadArray]
                assert(typeof serialized === 'string')
                assert.deepEqual(arr, JSON.parse(serialized))
            })
            it('correctly serializes messages with default version (30) payload', () => {
                expectedPayloadArray = [30, ['streamId', 0, 1529549961116, 0, 'address', 'msg-chain-id'], [1529549961000, 0],
                    StreamMessage.CONTENT_TYPES.MESSAGE, '{"valid": "json"}', StreamMessage.SIGNATURE_TYPES.ETH, 'signature']
                serialized = broadcastMessage.serialize()
            })
            it('correctly serializes messages with version 29 payload', () => {
                expectedPayloadArray = [29, 'streamId', 0, 1529549961116, 0, 1529549961116, 1529549961000,
                    StreamMessage.CONTENT_TYPES.MESSAGE, '{"valid": "json"}', StreamMessage.SIGNATURE_TYPES.ETH, 'address', 'signature']
                serialized = broadcastMessage.serialize(1, 29)
            })
            it('correctly serializes messages with version 28 payload', () => {
                expectedPayloadArray = [28, 'streamId', 0, 1529549961116, 0,
                    1529549961116, 1529549961000, StreamMessage.CONTENT_TYPES.MESSAGE, '{"valid": "json"}']
                serialized = broadcastMessage.serialize(1, 28)
            })
        })
        it('correctly serializes to version 0', () => {
            const streamMessageArray = [30, ['streamId', 0, 1529549961116, 0, 'address', 'msg-chain-id'], [1529549961000, 0],
                StreamMessage.CONTENT_TYPES.MESSAGE, '{"valid": "json"}', StreamMessage.SIGNATURE_TYPES.ETH, 'signature']
            const arr = [0, 0, null, streamMessageArray]
            const serialized = new BroadcastMessageV1(StreamMessageFactory.deserialize(streamMessageArray)).serialize(0)
            assert(typeof serialized === 'string')
            assert.deepEqual(arr, JSON.parse(serialized))
        })
        it('correctly serializes to version 0 with non-default payload', () => {
            const streamMessageArray = [30, ['streamId', 0, 1529549961116, 0, 'address', 'msg-chain-id'], [1529549961000, 0],
                StreamMessage.CONTENT_TYPES.MESSAGE, '{"valid": "json"}', StreamMessage.SIGNATURE_TYPES.ETH, 'signature']
            const serialized = new BroadcastMessageV1(StreamMessageFactory.deserialize(streamMessageArray)).serialize(0, 29)
            assert(typeof serialized === 'string')
            const expectedPayloadArray = [29, 'streamId', 0, 1529549961116, 0, 1529549961116, 1529549961000,
                StreamMessage.CONTENT_TYPES.MESSAGE, '{"valid": "json"}', StreamMessage.SIGNATURE_TYPES.ETH, 'address', 'signature']
            const arr = [0, 0, null, expectedPayloadArray]
            assert.deepEqual(arr, JSON.parse(serialized))
        })
    })
})

import assert from 'assert'
import StreamMessageFactory from '../../../../src/protocol/message_layer/StreamMessageFactory'
import StreamMessage from '../../../../src/protocol/message_layer/StreamMessage'
import StreamMessageV30 from '../../../../src/protocol/message_layer/StreamMessageV30'
import UnicastMessageV0 from '../../../../src/protocol/control_layer/unicast_message/UnicastMessageV0'

describe('UnicastMessageV0', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            const arr = ['subId', [30, ['TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0, 'address'], [1529549961000, 0],
                StreamMessage.CONTENT_TYPES.JSON, '{"valid": "json"}', StreamMessage.SIGNATURE_TYPES.ETH, 'signature']]
            const streamMsg = StreamMessageFactory.deserialize(arr[1])
            const result = new UnicastMessageV0(streamMsg, arr[0])
            assert(result.payload instanceof StreamMessageV30)
            assert.strictEqual(result.subId, 'subId')
        })
    })
    describe('serialize', () => {
        describe('serialize version 1', () => {
            let unicastMessage
            let expectedPayloadArray
            let serialized
            beforeEach(() => {
                const streamMessageArray = [30, ['streamId', 0, 1529549961116, 0, 'address'], [1529549961000, 0],
                    StreamMessage.CONTENT_TYPES.JSON, '{"valid": "json"}', StreamMessage.SIGNATURE_TYPES.ETH, 'signature']
                unicastMessage = new UnicastMessageV0(StreamMessageFactory.deserialize(streamMessageArray), 'subId')
            })
            afterEach(() => {
                const arr = [0, 1, 'subId', expectedPayloadArray]
                assert(typeof serialized === 'string')
                assert.deepEqual(arr, JSON.parse(serialized))
            })
            it('correctly serializes messages with default version (30) payload', () => {
                expectedPayloadArray = [30, ['streamId', 0, 1529549961116, 0, 'address'], [1529549961000, 0],
                    StreamMessage.CONTENT_TYPES.JSON, '{"valid": "json"}', StreamMessage.SIGNATURE_TYPES.ETH, 'signature']
                serialized = unicastMessage.serialize()
            })
            it('correctly serializes messages with version 29 payload', () => {
                expectedPayloadArray = [29, 'streamId', 0, 1529549961116, 0, 1529549961116, 1529549961000,
                    StreamMessage.CONTENT_TYPES.JSON, '{"valid": "json"}', StreamMessage.SIGNATURE_TYPES.ETH, 'address', 'signature']
                serialized = unicastMessage.serialize(0, 29)
            })
            it('correctly serializes messages with version 28 payload', () => {
                expectedPayloadArray = [28, 'streamId', 0, 1529549961116, 0,
                    1529549961116, 1529549961000, StreamMessage.CONTENT_TYPES.JSON, '{"valid": "json"}']
                serialized = unicastMessage.serialize(0, 28)
            })
        })
        it('correctly serializes to version 1', () => {
            const streamMessageArray = [30, ['streamId', 0, 1529549961116, 0, 'address'], [1529549961000, 0],
                StreamMessage.CONTENT_TYPES.JSON, '{"valid": "json"}', StreamMessage.SIGNATURE_TYPES.ETH, 'signature']
            const arr = [1, 1, 'subId', streamMessageArray]
            const serialized = new UnicastMessageV0(StreamMessageFactory.deserialize(streamMessageArray), 'subId').serialize(1)
            assert(typeof serialized === 'string')
            assert.deepEqual(arr, JSON.parse(serialized))
        })
        it('correctly serializes to version 1 with non-default payload version', () => {
            const streamMessageArray = [30, ['streamId', 0, 1529549961116, 0, 'address'], [1529549961000, 0],
                StreamMessage.CONTENT_TYPES.JSON, '{"valid": "json"}', StreamMessage.SIGNATURE_TYPES.ETH, 'signature']
            const serialized = new UnicastMessageV0(StreamMessageFactory.deserialize(streamMessageArray), 'subId').serialize(1, 29)
            assert(typeof serialized === 'string')
            const expectedPayloadArray = [29, 'streamId', 0, 1529549961116, 0, 1529549961116, 1529549961000,
                StreamMessage.CONTENT_TYPES.JSON, '{"valid": "json"}', StreamMessage.SIGNATURE_TYPES.ETH, 'address', 'signature']
            const arr = [1, 1, 'subId', expectedPayloadArray]
            assert.deepEqual(arr, JSON.parse(serialized))
        })
    })
})

import assert from 'assert'
import ControlMessage from '../../../../src/protocol/control_layer/ControlMessage'
import UnsubscribeRequest from '../../../../src/protocol/control_layer/unsubscribe_request/UnsubscribeRequest'
import '../../../../src/protocol/control_layer/unsubscribe_request/UnsubscribeRequestSerializerV2'
import { toStreamID } from '../../../../src/utils/StreamID'

const VERSION = 2

// Message definitions
const message = new UnsubscribeRequest({
    version: VERSION,
    requestId: 'requestId',
    streamId: toStreamID('streamId'),
    streamPartition: 0,
})
const serializedMessage = JSON.stringify([VERSION, ControlMessage.TYPES.UnsubscribeRequest, 'requestId', 'streamId', 0])

describe('UnsubscribeRequestSerializerV2', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            assert.deepStrictEqual(ControlMessage.deserialize(serializedMessage), message)
        })
    })
    describe('serialize', () => {
        it('correctly serializes messages', () => {
            assert.deepStrictEqual(message.serialize(VERSION), serializedMessage)
        })
    })
})

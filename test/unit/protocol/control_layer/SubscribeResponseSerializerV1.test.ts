import assert from 'assert'

import { ControlLayer } from '../../../../src/index'
import { PLACEHOLDER_REQUEST_ID_PROTOCOL_V1 } from '../../../../src/protocol/control_layer/ControlMessage'

const { SubscribeResponse, ControlMessage } = ControlLayer

const VERSION = 1

// Message definitions
const message = new SubscribeResponse({
    version: VERSION,
    streamId: 'streamId',
    streamPartition: 0,
    requestId: PLACEHOLDER_REQUEST_ID_PROTOCOL_V1
})
const serializedMessage = JSON.stringify([VERSION, ControlMessage.TYPES.SubscribeResponse, 'streamId', 0])

describe('SubscribeResponseSerializerV1', () => {
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

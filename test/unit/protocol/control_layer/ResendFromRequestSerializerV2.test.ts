import assert from 'assert'

import MessageRef from '../../../../src/protocol/message_layer/MessageRef'
import { ControlLayer } from '../../../../src/index'

const { ResendFromRequest, ControlMessage } = ControlLayer

const VERSION = 2

// Message definitions
const message = new ResendFromRequest({
    version: VERSION,
    requestId: 'requestId',
    streamId: 'streamId',
    streamPartition: 0,
    fromMsgRef: new MessageRef(132846894, 0),
    publisherId: 'publisherId',
    sessionToken: 'sessionToken',
})
const serializedMessage = JSON.stringify([VERSION, ControlMessage.TYPES.ResendFromRequest, 'requestId', 'streamId', 0, [132846894, 0], 'publisherId', 'sessionToken'])

describe('ResendFromRequestSerializerV2', () => {
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

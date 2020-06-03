import assert from 'assert'

import { ControlLayer } from '../../../../src/index'

const { SubscribeRequest, ControlMessage } = ControlLayer

const VERSION = 2

// Message definitions
const message = new SubscribeRequest({
    version: VERSION,
    requestId: 'requestId',
    streamId: 'streamId',
    streamPartition: 0,
    sessionToken: 'sessionToken',
})
const serializedMessage = JSON.stringify([VERSION, ControlMessage.TYPES.SubscribeRequest, 'requestId', 'streamId', 0, 'sessionToken'])

describe('SubscribeRequestSerializerV2', () => {
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

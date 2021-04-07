import assert from 'assert'

import { ResendLastRequest, ControlMessage } from '../../../../src/index'

const VERSION = 1

// Message definitions
const message = new ResendLastRequest({
    version: VERSION,
    requestId: 'requestId',
    streamId: 'streamId',
    streamPartition: 0,
    numberLast: 100,
    sessionToken: 'sessionToken',
})
const serializedMessage = JSON.stringify([VERSION, ControlMessage.TYPES.ResendLastRequest, 'streamId', 0, 'requestId', 100, 'sessionToken'])

describe('ResendLastRequestSerializerV1', () => {
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

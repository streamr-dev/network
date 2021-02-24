import assert from 'assert'

import { ResendResponseResent, ControlMessage } from '../../../../src/index'

const VERSION = 1

// Message definitions
const message = new ResendResponseResent({
    version: VERSION,
    requestId: 'requestId',
    streamId: 'streamId',
    streamPartition: 0,
})
const serializedMessage = JSON.stringify([VERSION, ControlMessage.TYPES.ResendResponseResent, 'streamId', 0, 'requestId'])

describe('ResendResponseResentSerializerV1', () => {
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

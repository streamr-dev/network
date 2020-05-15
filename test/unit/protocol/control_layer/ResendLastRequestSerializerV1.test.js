import assert from 'assert'

import { ControlLayer } from '../../../../src/index'

const { ResendLastRequest, ControlMessage } = ControlLayer

const VERSION = 1

// Message definitions
const message = new ResendLastRequest(VERSION, 'requestId', 'streamId', 0, 100, 'sessionToken')
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

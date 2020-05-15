import assert from 'assert'

import { ControlLayer } from '../../../../src/index'

const { UnsubscribeResponse, ControlMessage } = ControlLayer

const VERSION = 1

// Message definitions
const message = new UnsubscribeResponse(VERSION, null, 'streamId', 0)
const serializedMessage = JSON.stringify([VERSION, ControlMessage.TYPES.UnsubscribeResponse, 'streamId', 0])

describe('UnsubscribeResponseSerializerV1', () => {
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

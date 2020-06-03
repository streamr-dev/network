import assert from 'assert'

import { ControlLayer } from '../../../../src/index'

const { ErrorResponse, ControlMessage } = ControlLayer

const VERSION = 1

// Message definitions
const message = new ErrorResponse({
    version: VERSION,
    errorMessage: 'error message',
})
const serializedMessage = JSON.stringify([VERSION, ControlMessage.TYPES.ErrorResponse, 'error message'])

describe('ErrorResponseSerializerV1', () => {
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

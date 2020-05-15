import assert from 'assert'

import { ControlLayer } from '../../../../src/index'

const { ErrorResponse, ControlMessage } = ControlLayer

const VERSION = 2

// Message definitions
const message = new ErrorResponse(VERSION, 'requestId', 'error message', 'ERROR_CODE')
const serializedMessage = JSON.stringify([VERSION, ControlMessage.TYPES.ErrorResponse, 'requestId', 'error message', 'ERROR_CODE'])

describe('ErrorResponseSerializerV2', () => {
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

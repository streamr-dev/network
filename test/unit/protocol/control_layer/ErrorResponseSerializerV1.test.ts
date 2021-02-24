import assert from 'assert'

import { ErrorResponse, ControlMessage } from '../../../../src/index'
import { PLACEHOLDER_REQUEST_ID_PROTOCOL_V1 } from '../../../../src/protocol/control_layer/ControlMessage'
import { ErrorCode } from '../../../../src/protocol/control_layer/error_response/ErrorResponse'

const VERSION = 1

// Message definitions
const message = new ErrorResponse({
    version: VERSION,
    errorMessage: 'error message',
    requestId: PLACEHOLDER_REQUEST_ID_PROTOCOL_V1,
    errorCode: ErrorCode.UNKNOWN
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

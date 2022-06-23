import assert from 'assert'

import {
    StreamMessage,
    GroupKeyMessage,
    GroupKeyErrorResponse,
    toStreamID
} from '../../../../src/index'

// Message definitions
const message = new GroupKeyErrorResponse({
    requestId: 'requestId',
    streamId: toStreamID('streamId'),
    errorCode: 'ErrorCode',
    errorMessage: 'errorMessage',
    groupKeyIds: ['groupKeyId1', 'groupKeyId2'],
})
const serializedMessage = JSON.stringify(['requestId', 'streamId', 'ErrorCode', 'errorMessage', ['groupKeyId1', 'groupKeyId2']])

describe('GroupKeyErrorResponse', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            assert.deepStrictEqual(GroupKeyMessage.deserialize(serializedMessage, StreamMessage.MESSAGE_TYPES.GROUP_KEY_ERROR_RESPONSE), message)
        })
    })
    describe('serialize', () => {
        it('correctly serializes messages', () => {
            assert.deepStrictEqual(message.serialize(), serializedMessage)
        })
    })
})

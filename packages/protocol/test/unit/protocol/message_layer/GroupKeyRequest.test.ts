import assert from 'assert'

import {
    StreamMessage,
    GroupKeyMessage,
    GroupKeyRequest,
    toStreamID
} from '../../../../src/index'

// Message definitions
const message = new GroupKeyRequest({
    requestId: 'requestId',
    streamId: toStreamID('streamId'),
    rsaPublicKey: 'rsaPublicKey',
    groupKeyIds: ['groupKeyId1', 'groupKeyId2'],
})
const serializedMessage = JSON.stringify(['requestId', 'streamId', 'rsaPublicKey', ['groupKeyId1', 'groupKeyId2']])

describe('GroupKeyRequest', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            assert.deepStrictEqual(GroupKeyMessage.deserialize(serializedMessage, StreamMessage.MESSAGE_TYPES.GROUP_KEY_REQUEST), message)
        })
    })
    describe('serialize', () => {
        it('correctly serializes messages', () => {
            assert.deepStrictEqual(message.serialize(), serializedMessage)
        })
    })
})

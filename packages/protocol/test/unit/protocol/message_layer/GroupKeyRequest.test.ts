import assert from 'assert'

import {
    StreamMessage,
    GroupKeyRequest
} from '../../../../src/index'
import GroupKeyMessage from '../../../../src/protocol/message_layer/GroupKeyMessage'

// Message definitions
const message = new GroupKeyRequest({
    requestId: 'requestId',
    recipient: '0xaaaaaAAAAA012345678901234567890123456789',
    rsaPublicKey: 'rsaPublicKey',
    groupKeyIds: ['groupKeyId1', 'groupKeyId2'],
})
const serializedMessage = JSON.stringify(['requestId', '0xaaaaaAAAAA012345678901234567890123456789', 'rsaPublicKey', ['groupKeyId1', 'groupKeyId2']])

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

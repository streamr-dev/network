import assert from 'assert'

import {
    StreamMessage,
    GroupKeyResponse
} from '../../../../src/index'
import EncryptedGroupKey from '../../../../src/protocol/message_layer/EncryptedGroupKey'
import GroupKeyMessage from '../../../../src/protocol/message_layer/GroupKeyMessage'

// Message definitions
const message = new GroupKeyResponse({
    requestId: 'requestId',
    recipient: '0xaaaaaAAAAA012345678901234567890123456789',
    encryptedGroupKeys: [
        new EncryptedGroupKey('groupKeyId1', 'encryptedGroupKey1'),
        new EncryptedGroupKey('groupKeyId2', 'encryptedGroupKey2'),
    ],
})
// eslint-disable-next-line max-len
const serializedMessage = JSON.stringify(['requestId', '0xaaaaaAAAAA012345678901234567890123456789', [['groupKeyId1', 'encryptedGroupKey1'], ['groupKeyId2', 'encryptedGroupKey2']]])

describe('GroupKeyResponse', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            assert.deepStrictEqual(GroupKeyMessage.deserialize(serializedMessage, StreamMessage.MESSAGE_TYPES.GROUP_KEY_RESPONSE), message)
        })
    })
    describe('serialize', () => {
        it('correctly serializes messages', () => {
            assert.deepStrictEqual(message.serialize(), serializedMessage)
        })
    })
})

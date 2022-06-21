import assert from 'assert'

import {
    StreamMessage,
    GroupKeyMessage,
    GroupKeyResponse,
    toStreamID
} from '../../../../src/index'
import EncryptedGroupKey from '../../../../src/protocol/message_layer/EncryptedGroupKey'

// Message definitions
const message = new GroupKeyResponse({
    requestId: 'requestId',
    streamId: toStreamID('streamId'),
    encryptedGroupKeys: [
        new EncryptedGroupKey('groupKeyId1', 'encryptedGroupKey1'),
        new EncryptedGroupKey('groupKeyId2', 'encryptedGroupKey2'),
    ],
})
const serializedMessage = JSON.stringify(['requestId', 'streamId', [['groupKeyId1', 'encryptedGroupKey1'], ['groupKeyId2', 'encryptedGroupKey2']]])

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

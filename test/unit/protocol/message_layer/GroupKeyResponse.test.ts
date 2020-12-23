import assert from 'assert'

import { MessageLayer } from '../../../../src/index'
import EncryptedGroupKey from '../../../../src/protocol/message_layer/EncryptedGroupKey'

const {
    StreamMessage, MessageID, MessageRef, GroupKeyMessage, GroupKeyResponse
} = MessageLayer

// Message definitions
const message = new GroupKeyResponse({
    requestId: 'requestId',
    streamId: 'streamId',
    encryptedGroupKeys: [
        new EncryptedGroupKey('groupKeyId1', 'encryptedGroupKey1'),
        new EncryptedGroupKey('groupKeyId2', 'encryptedGroupKey2'),
    ],
})
const serializedMessage = JSON.stringify(['requestId', 'streamId', [['groupKeyId1', 'encryptedGroupKey1'], ['groupKeyId2', 'encryptedGroupKey2']]])

const streamMessage = new StreamMessage({
    messageId: new MessageID('streamId', 0, 1, 0, 'publisherId', 'msgChainId'),
    prevMsgRef: new MessageRef(0, 0),
    content: serializedMessage,
    messageType: StreamMessage.MESSAGE_TYPES.GROUP_KEY_RESPONSE,
})

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
    describe('toStreamMessage', () => {
        it('produces the expected StreamMessage', () => {
            assert.deepStrictEqual(message.toStreamMessage(streamMessage.getMessageID(), streamMessage.getPreviousMessageRef()!), streamMessage)
        })
    })
    describe('fromStreamMessage', () => {
        it('produces the expected key exchange message', () => {
            assert.deepStrictEqual(GroupKeyMessage.fromStreamMessage(streamMessage), message)
        })
    })
})

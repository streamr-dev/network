import assert from 'assert'

import {
    StreamMessage, MessageID, MessageRef, GroupKeyMessage, GroupKeyErrorResponse, toStreamID
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

const streamMessage = new StreamMessage({
    messageId: new MessageID(toStreamID('streamId'), 0, 1, 0, 'publisherId', 'msgChainId'),
    prevMsgRef: new MessageRef(0, 0),
    content: serializedMessage,
    messageType: StreamMessage.MESSAGE_TYPES.GROUP_KEY_ERROR_RESPONSE,
})

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

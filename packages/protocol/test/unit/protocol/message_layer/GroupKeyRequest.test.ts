import { toEthereumAddress } from '@streamr/utils'
import assert from 'assert'
import GroupKeyMessage from '../../../../src/protocol/message_layer/GroupKeyMessage'
import GroupKeyRequest from '../../../../src/protocol/message_layer/GroupKeyRequest'
import { StreamMessageType } from '../../../../src/protocol/message_layer/StreamMessage'

const recipient = toEthereumAddress('0xaaaaaAAAAA012345678901234567890123456789')

// Message definitions
const message = new GroupKeyRequest({
    requestId: 'requestId',
    recipient,
    rsaPublicKey: 'rsaPublicKey',
    groupKeyIds: ['groupKeyId1', 'groupKeyId2'],
})
const serializedMessage = JSON.stringify(['requestId', recipient, 'rsaPublicKey', ['groupKeyId1', 'groupKeyId2']])

describe('GroupKeyRequest', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            assert.deepStrictEqual(GroupKeyMessage.deserialize(serializedMessage, StreamMessageType.GROUP_KEY_REQUEST), message)
        })
    })
    describe('serialize', () => {
        it('correctly serializes messages', () => {
            assert.deepStrictEqual(message.serialize(), serializedMessage)
        })
    })
})

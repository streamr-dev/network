import { toEthereumAddress, hexToBinary } from '@streamr/utils'
import assert from 'assert'
import EncryptedGroupKey from '../../../../src/protocol/message_layer/EncryptedGroupKey'
import GroupKeyMessage from '../../../../src/protocol/message_layer/GroupKeyMessage'
import GroupKeyResponse from '../../../../src/protocol/message_layer/GroupKeyResponse'
import { StreamMessageType } from '../../../../src/protocol/message_layer/StreamMessage'

const recipient = toEthereumAddress('0xaaaaaAAAAA012345678901234567890123456789')

// Message definitions
const message = new GroupKeyResponse({
    requestId: 'requestId',
    recipient,
    encryptedGroupKeys: [
        new EncryptedGroupKey('groupKeyId1', hexToBinary('1111')),
        new EncryptedGroupKey('groupKeyId2', hexToBinary('2222')),
    ],
})
// eslint-disable-next-line max-len
const serializedMessage = JSON.stringify(['requestId', recipient, [['groupKeyId1', '1111'], ['groupKeyId2', '2222']]])

describe('GroupKeyResponse', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            assert.deepStrictEqual(GroupKeyMessage.deserialize(serializedMessage, StreamMessageType.GROUP_KEY_RESPONSE), message)
        })
    })
    describe('serialize', () => {
        it('correctly serializes messages', () => {
            assert.deepStrictEqual(message.serialize(), serializedMessage)
        })
    })
})

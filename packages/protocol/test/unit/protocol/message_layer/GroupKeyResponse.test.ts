import assert from 'assert'

import {
    GroupKeyResponse,
    StreamMessageType
} from '../../../../src/index'
import EncryptedGroupKey from '../../../../src/protocol/message_layer/EncryptedGroupKey'
import GroupKeyMessage from '../../../../src/protocol/message_layer/GroupKeyMessage'
import { toEthereumAddress } from '@streamr/utils'

const recipient = toEthereumAddress('0xaaaaaAAAAA012345678901234567890123456789')

// Message definitions
const message = new GroupKeyResponse({
    requestId: 'requestId',
    recipient,
    encryptedGroupKeys: [
        new EncryptedGroupKey('groupKeyId1', 'encryptedGroupKey1'),
        new EncryptedGroupKey('groupKeyId2', 'encryptedGroupKey2'),
    ],
})
// eslint-disable-next-line max-len
const serializedMessage = JSON.stringify(['requestId', recipient, [['groupKeyId1', 'encryptedGroupKey1'], ['groupKeyId2', 'encryptedGroupKey2']]])

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

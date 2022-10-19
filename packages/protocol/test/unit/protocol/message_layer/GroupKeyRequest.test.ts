import assert from 'assert'

import {
    StreamMessage,
    GroupKeyRequest
} from '../../../../src/index'
import GroupKeyMessage from '../../../../src/protocol/message_layer/GroupKeyMessage'
import { toEthereumAddress } from '@streamr/utils'

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
            assert.deepStrictEqual(GroupKeyMessage.deserialize(serializedMessage, StreamMessage.MESSAGE_TYPES.GROUP_KEY_REQUEST), message)
        })
    })
    describe('serialize', () => {
        it('correctly serializes messages', () => {
            assert.deepStrictEqual(message.serialize(), serializedMessage)
        })
    })
})

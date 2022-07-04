import { random } from 'lodash'
import { StreamMessage, toStreamID } from 'streamr-client-protocol'
import { GroupKey } from '../../src/encryption/GroupKey'
import { MessageFactory } from '../../src/publish/MessageFactory'
import { createMockAddress } from '../test-utils/utils'

const AUTHENTICATED_USER = createMockAddress()
const STREAM_ID = toStreamID('/path', AUTHENTICATED_USER)
const CONTENT = { foo: 'bar' }
const TIMESTAMP = Date.parse('2001-02-03T04:05:06Z')
const PARTITION_COUNT = 50
const SIGNATURE = 'mock-signature'
const GROUP_KEY = GroupKey.generate()

describe('MessageFactory', () => {

    let messageFactory: MessageFactory

    beforeEach(() => {
        messageFactory = new MessageFactory(
            STREAM_ID,
            PARTITION_COUNT,
            false,
            AUTHENTICATED_USER.toLowerCase(),
            async () => SIGNATURE,
            async () => [GROUP_KEY, undefined]
        )
    })

    it('happy path', async () => {
        const msg = await messageFactory.createMessage(undefined, CONTENT, { timestamp: TIMESTAMP })
        expect(msg).toMatchObject({
            contentType: 0,
            encryptionType: StreamMessage.ENCRYPTION_TYPES.AES,
            groupKeyId: GROUP_KEY.id,
            messageId: {
                msgChainId: expect.anything(),
                publisherId: AUTHENTICATED_USER.toLowerCase(),
                sequenceNumber: 0,
                streamId: STREAM_ID,
                streamPartition: expect.toBeWithin(0, PARTITION_COUNT),
                timestamp: TIMESTAMP
            },
            messageType: StreamMessage.MESSAGE_TYPES.MESSAGE,
            newGroupKey: null,
            prevMsgRef: null,
            serializedContent: expect.anything(),
            signature: expect.anything(),
            signatureType: StreamMessage.SIGNATURE_TYPES.ETH
        })
    })
    
    it('metadata', async () => {
        const MSG_CHAIN_ID = 'mock-msgChainId'
        const msg = await messageFactory.createMessage(undefined, CONTENT, {
            timestamp: TIMESTAMP,
            msgChainId: MSG_CHAIN_ID
        })
        expect(msg.messageId.msgChainId).toBe(MSG_CHAIN_ID)
    })

    describe('partitions', () => {
        it('partition and partitionKey', async () => {
            // eslint-disable-next-line max-len
            return expect(() => {
                return messageFactory.createMessage(0, CONTENT, {
                    timestamp: TIMESTAMP,
                    partitionKey: 'mockPartitionKey'
                })
            }).rejects.toThrow('Invalid combination of "partition" and "partitionKey"')
        })

        it('no partition key: uses same partition for all messages', async () => {
            const msg1 = await messageFactory.createMessage(undefined, CONTENT, {
                timestamp: TIMESTAMP
            })
            const msg2 = await messageFactory.createMessage(undefined, CONTENT, {
                timestamp: TIMESTAMP
            })
            expect(msg1!.messageId.streamPartition).toBe(msg2!.messageId.streamPartition)
        })

        it('same partition key maps to same partition', async () => {
            const partitionKey = `mock-partition-key-${random(Number.MAX_SAFE_INTEGER)}`
            const msg1 = await messageFactory.createMessage(undefined, CONTENT, {
                timestamp: TIMESTAMP,
                partitionKey
            })
            const msg2 = await messageFactory.createMessage(undefined, CONTENT, {
                timestamp: TIMESTAMP,
                partitionKey
            })
            expect(msg1!.messageId.streamPartition).toBe(msg2!.messageId.streamPartition)
        })

        it('numeric partition key maps to the partition if in range', async () => {
            const partitionKey = 10
            const msg = await messageFactory.createMessage(undefined, CONTENT, {
                timestamp: TIMESTAMP,
                partitionKey
            })
            expect(msg!.messageId.streamPartition).toBe(partitionKey)
        })

        it('numeric partition key maps to partition range', async () => {
            const partitionOffset = 20
            const msg = await messageFactory.createMessage(undefined, CONTENT, {
                timestamp: TIMESTAMP,
                partitionKey: PARTITION_COUNT + partitionOffset
            })
            expect(msg!.messageId.streamPartition).toBe(partitionOffset)
        })
    })
})

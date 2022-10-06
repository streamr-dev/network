import { random } from 'lodash'
import { MAX_PARTITION_COUNT, StreamMessage, toStreamID } from 'streamr-client-protocol'
import { keyToArrayIndex } from '@streamr/utils'
import { GroupKey } from '../../src/encryption/GroupKey'
import { MessageFactory, MessageFactoryOptions } from '../../src/publish/MessageFactory'
import { createMockAddress } from '../test-utils/utils'

const AUTHENTICATED_USER = createMockAddress()
const STREAM_ID = toStreamID('/path', AUTHENTICATED_USER)
const CONTENT = { foo: 'bar' }
const TIMESTAMP = Date.parse('2001-02-03T04:05:06Z')
const PARTITION_COUNT = 50
const SIGNATURE = 'mock-signature'
const GROUP_KEY = GroupKey.generate()

const createMessageFactory = (overridenOpts?: Partial<MessageFactoryOptions>) => {
    const defaultOpts = {
        publisherId: AUTHENTICATED_USER.toLowerCase(),
        streamId: STREAM_ID,
        getPartitionCount: async () => PARTITION_COUNT,
        isPublicStream: async () => false,
        isPublisher: async () => true,
        createSignature: async () => SIGNATURE,
        useGroupKey: async () => ({ current: GROUP_KEY })
    }
    return new MessageFactory({
        ...defaultOpts,
        ...overridenOpts
    })
}

describe('MessageFactory', () => {

    it('happy path', async () => {
        const messageFactory = createMessageFactory()
        const msg = await messageFactory.createMessage(CONTENT, { timestamp: TIMESTAMP })
        expect(msg).toMatchObject({
            messageId: {
                msgChainId: expect.any(String),
                publisherId: AUTHENTICATED_USER.toLowerCase(),
                sequenceNumber: 0,
                streamId: STREAM_ID,
                streamPartition: expect.toBeWithin(0, PARTITION_COUNT),
                timestamp: TIMESTAMP
            },
            prevMsgRef: null,
            messageType: StreamMessage.MESSAGE_TYPES.MESSAGE,
            encryptionType: StreamMessage.ENCRYPTION_TYPES.AES,
            groupKeyId: GROUP_KEY.id,
            newGroupKey: null,
            signature: SIGNATURE,
            signatureType: StreamMessage.SIGNATURE_TYPES.ETH,
            contentType: StreamMessage.CONTENT_TYPES.JSON,
            serializedContent: expect.stringMatching(/^[0-9a-f]+$/),
        })
    })

    it('public stream', async () => {
        const messageFactory = createMessageFactory({
            isPublicStream: async () => true,
            useGroupKey: () => Promise.reject()
        })
        const msg = await messageFactory.createMessage(CONTENT, { timestamp: TIMESTAMP })
        expect(msg).toMatchObject({
            encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
            groupKeyId: null,
            serializedContent: JSON.stringify(CONTENT)
        })
    })

    it('metadata', async () => {
        const messageFactory = createMessageFactory()
        const partitionKey = 'mock-partitionKey'
        const msgChainId = 'mock-msgChainId'
        const msg = await messageFactory.createMessage(CONTENT, {
            timestamp: TIMESTAMP,
            partitionKey,
            msgChainId
        })
        expect(msg).toMatchObject({
            messageId: {
                msgChainId,
                streamPartition: keyToArrayIndex(PARTITION_COUNT, partitionKey)
            }
        })
    })

    it('next group key', async () => {
        const nextGroupKey = GroupKey.generate()
        const messageFactory = createMessageFactory({
            useGroupKey: async () => ({ current: GROUP_KEY, next: nextGroupKey })
        })
        const msg = await messageFactory.createMessage(CONTENT, {
            timestamp: TIMESTAMP
        })
        expect(msg.groupKeyId).toBe(GROUP_KEY.id)
        expect(msg.newGroupKey).toMatchObject({
            groupKeyId: nextGroupKey.id,
            encryptedGroupKeyHex: expect.any(String)
        })
        expect(GROUP_KEY.decryptNextGroupKey(msg.newGroupKey!)).toEqual(nextGroupKey)
    })

    it('not a publisher', () => {
        const messageFactory = createMessageFactory({
            isPublisher: async () => false
        })
        return expect(async () => {
            await messageFactory.createMessage(CONTENT, {
                timestamp: TIMESTAMP
            })
        }).rejects.toThrow(/is not a publisher on stream/)
    })

    describe('partitions', () => {
        it('partition and partitionKey', async () => {
            const messageFactory = createMessageFactory()
            return expect(() => {
                return messageFactory.createMessage(
                    CONTENT,
                    {
                        timestamp: TIMESTAMP,
                        partitionKey: 'mockPartitionKey'
                    },
                    0
                )
            }).rejects.toThrow('Invalid combination of "partition" and "partitionKey"')
        })

        it('no partition key: uses same partition for all messages', async () => {
            const messageFactory = createMessageFactory()
            const msg1 = await messageFactory.createMessage(CONTENT, {
                timestamp: TIMESTAMP
            })
            const msg2 = await messageFactory.createMessage(CONTENT, {
                timestamp: TIMESTAMP
            })
            expect(msg1!.messageId.streamPartition).toBe(msg2!.messageId.streamPartition)
        })

        it('same partition key maps to same partition', async () => {
            const messageFactory = createMessageFactory()
            const partitionKey = `mock-partition-key-${random(Number.MAX_SAFE_INTEGER)}`
            const msg1 = await messageFactory.createMessage(CONTENT, {
                timestamp: TIMESTAMP,
                partitionKey
            })
            const msg2 = await messageFactory.createMessage(CONTENT, {
                timestamp: TIMESTAMP,
                partitionKey
            })
            expect(msg1!.messageId.streamPartition).toBe(msg2!.messageId.streamPartition)
        })

        it('numeric partition key maps to the partition if in range', async () => {
            const messageFactory = createMessageFactory()
            const partitionKey = 10
            const msg = await messageFactory.createMessage(CONTENT, {
                timestamp: TIMESTAMP,
                partitionKey
            })
            expect(msg!.messageId.streamPartition).toBe(partitionKey)
        })

        it('numeric partition key maps to partition range', async () => {
            const messageFactory = createMessageFactory()
            const partitionOffset = 20
            const msg = await messageFactory.createMessage(CONTENT, {
                timestamp: TIMESTAMP,
                partitionKey: PARTITION_COUNT + partitionOffset
            })
            expect(msg!.messageId.streamPartition).toBe(partitionOffset)
        })

        it('selected random partition in range when partition count decreases', async () => {
            let partitionCount: number = MAX_PARTITION_COUNT - 1
            const messageFactory = createMessageFactory({
                getPartitionCount: async () => partitionCount
            })
            while (partitionCount > 0) {
                const msg = await messageFactory.createMessage(CONTENT, {
                    timestamp: TIMESTAMP
                })
                expect(msg.messageId.streamPartition).toBeLessThan(partitionCount)
                // eslint-disable-next-line no-plusplus
                partitionCount--
            }
        })
    })

    describe('message chains', () => {
        it('happy path', async () => {
            const messageFactory = createMessageFactory()
            const msg1 = await messageFactory.createMessage(CONTENT, { timestamp: TIMESTAMP })
            const msg2 = await messageFactory.createMessage(CONTENT, { timestamp: TIMESTAMP })
            expect(msg1.getMessageID().msgChainId).toBe(msg2.getMessageID().msgChainId)
            expect(msg2.getPreviousMessageRef()).toEqual(msg1.getMessageRef())
        })

        it('partitions have separate chains', async () => {
            const messageFactory = createMessageFactory()
            const msg1 = await messageFactory.createMessage(CONTENT, { timestamp: TIMESTAMP })
            const msg2 = await messageFactory.createMessage(CONTENT, { timestamp: TIMESTAMP, partitionKey: 'mock-key' })
            expect(msg1.getMessageID().msgChainId).not.toBe(msg2.getMessageID().msgChainId)
            expect(msg2.getPreviousMessageRef()).toBe(null)
        })

        it('explicit msgChainId', async () => {
            const messageFactory = createMessageFactory()
            const msg1 = await messageFactory.createMessage(CONTENT, { timestamp: TIMESTAMP, msgChainId: 'mock-id' })
            const msg2 = await messageFactory.createMessage(CONTENT, { timestamp: TIMESTAMP })
            const msg3 = await messageFactory.createMessage(CONTENT, { timestamp: TIMESTAMP, msgChainId: 'mock-id' })
            expect(msg1.getMessageID().msgChainId).toBe('mock-id')
            expect(msg2.getMessageID().msgChainId).not.toBe(msg1.getMessageID().msgChainId)
            expect(msg2.getPreviousMessageRef()).toBe(null)
            expect(msg3.getMessageID().msgChainId).toBe('mock-id')
            expect(msg3.getPreviousMessageRef()).toEqual(msg1.getMessageRef())
        })
    })
})

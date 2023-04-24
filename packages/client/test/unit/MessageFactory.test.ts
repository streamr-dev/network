import { keyToArrayIndex, toEthereumAddress } from '@streamr/utils'
import random from 'lodash/random'
import { ContentType, EncryptionType, MAX_PARTITION_COUNT, StreamMessage, StreamMessageType, toStreamID } from '@streamr/protocol'
import { fastWallet } from '@streamr/test-utils'
import { createPrivateKeyAuthentication } from '../../src/Authentication'
import { GroupKey } from '../../src/encryption/GroupKey'
import { PublishMetadata } from '../../src/publish/Publisher'
import { GroupKeyQueue } from '../../src/publish/GroupKeyQueue'
import { MessageFactory, MessageFactoryOptions } from '../../src/publish/MessageFactory'
import { StreamRegistryCached } from '../../src/registry/StreamRegistryCached'
import { createGroupKeyQueue, createStreamRegistryCached } from '../test-utils/utils'
import { merge } from '@streamr/utils'

const WALLET = fastWallet()
const STREAM_ID = toStreamID('/path', toEthereumAddress(WALLET.address))
const CONTENT = { foo: 'bar' }
const TIMESTAMP = Date.parse('2001-02-03T04:05:06Z')
const PARTITION_COUNT = 50
const GROUP_KEY = GroupKey.generate()

const createMessageFactory = async (opts?: {
    streamRegistry?: StreamRegistryCached
    groupKeyQueue?: GroupKeyQueue
}) => {
    const authentication = createPrivateKeyAuthentication(WALLET.privateKey, undefined as any)
    return new MessageFactory(
        merge<MessageFactoryOptions>(
            {
                streamId: STREAM_ID,
                authentication,
                streamRegistry: createStreamRegistryCached({
                    partitionCount: PARTITION_COUNT,
                    isPublicStream: false,
                    isStreamPublisher: true
                }),
                groupKeyQueue: await createGroupKeyQueue(authentication, GROUP_KEY)
            },
            opts
        )
    )
}

const createMessage = async (
    opts: Omit<PublishMetadata, 'timestamp'> & { timestamp?: number, explicitPartition?: number },
    messageFactory: MessageFactory
): Promise<StreamMessage> => {
    return messageFactory.createMessage(CONTENT, merge(
        {
            timestamp: TIMESTAMP
        },
        opts
    ), opts.explicitPartition)
}

describe('MessageFactory', () => {

    it('happy path', async () => {
        const messageFactory = await createMessageFactory()
        const msg = await createMessage({}, messageFactory)
        expect(msg).toMatchObject({
            messageId: {
                msgChainId: expect.any(String),
                publisherId: toEthereumAddress(WALLET.address),
                sequenceNumber: 0,
                streamId: STREAM_ID,
                streamPartition: expect.toBeWithin(0, PARTITION_COUNT),
                timestamp: TIMESTAMP
            },
            prevMsgRef: null,
            messageType: StreamMessageType.MESSAGE,
            encryptionType: EncryptionType.AES,
            groupKeyId: GROUP_KEY.id,
            newGroupKey: null,
            signature: expect.stringMatching(/^0x[0-9a-f]+$/),
            contentType: ContentType.JSON,
            serializedContent: expect.stringMatching(/^[0-9a-f]+$/)
        })
    })

    it('public stream', async () => {
        const messageFactory = await createMessageFactory({
            streamRegistry: createStreamRegistryCached({
                isPublicStream: true
            })
        })
        const msg = await createMessage({}, messageFactory)
        expect(msg).toMatchObject({
            encryptionType: EncryptionType.NONE,
            groupKeyId: null,
            serializedContent: JSON.stringify(CONTENT)
        })
    })

    it('metadata', async () => {
        const messageFactory = await createMessageFactory()
        const partitionKey = 'mock-partitionKey'
        const msgChainId = 'mock-msgChainId'
        const msg = await createMessage({
            partitionKey,
            msgChainId
        }, messageFactory)
        expect(msg).toMatchObject({
            messageId: {
                msgChainId,
                streamPartition: keyToArrayIndex(PARTITION_COUNT, partitionKey)
            }
        })
    })

    it('next group key', async () => {
        const nextGroupKey = GroupKey.generate()
        const messageFactory = await createMessageFactory({
            groupKeyQueue: await createGroupKeyQueue(createPrivateKeyAuthentication(WALLET.privateKey, undefined as any), GROUP_KEY, nextGroupKey)
        })
        const msg = await createMessage({}, messageFactory)
        expect(msg.groupKeyId).toBe(GROUP_KEY.id)
        expect(msg.newGroupKey).toMatchObject({
            groupKeyId: nextGroupKey.id,
            encryptedGroupKeyHex: expect.any(String)
        })
        expect(GROUP_KEY.decryptNextGroupKey(msg.newGroupKey!)).toEqual(nextGroupKey)
    })

    it('not a publisher', async () => {
        const messageFactory = await createMessageFactory({
            streamRegistry: createStreamRegistryCached({
                isStreamPublisher: false
            })
        })
        return expect(() =>
            createMessage({}, messageFactory)
        ).rejects.toThrow(/You don't have permission to publish to this stream/)
    })

    describe('partitions', () => {

        it('out of range', async () => {
            const messageFactory = await createMessageFactory()
            await expect(() =>
                createMessage({ explicitPartition: -1 }, messageFactory)
            ).rejects.toThrow(/out of range/)
            await expect(() =>
                createMessage({ explicitPartition: PARTITION_COUNT }, messageFactory)
            ).rejects.toThrow(/out of range/)
        })

        it('partition and partitionKey', async () => {
            const messageFactory = await createMessageFactory()
            return expect(() =>
                createMessage({ partitionKey: 'mockPartitionKey', explicitPartition: 0 }, messageFactory)
            ).rejects.toThrow('Invalid combination of "partition" and "partitionKey"')
        })

        it('no partition key: uses same partition for all messages', async () => {
            const messageFactory = await createMessageFactory()
            const msg1 = await createMessage({}, messageFactory)
            const msg2 = await createMessage({}, messageFactory)
            expect(msg1!.messageId.streamPartition).toBe(msg2!.messageId.streamPartition)
        })

        it('same partition key maps to same partition', async () => {
            const messageFactory = await createMessageFactory()
            const partitionKey = `mock-partition-key-${random(Number.MAX_SAFE_INTEGER)}`
            const msg1 = await createMessage({ partitionKey }, messageFactory)
            const msg2 = await createMessage({ partitionKey }, messageFactory)
            expect(msg1!.messageId.streamPartition).toBe(msg2!.messageId.streamPartition)
        })

        it('numeric partition key maps to the partition if in range', async () => {
            const messageFactory = await createMessageFactory()
            const partitionKey = 10
            const msg = await createMessage({ partitionKey }, messageFactory)
            expect(msg!.messageId.streamPartition).toBe(partitionKey)
        })

        it('numeric partition key maps to partition range', async () => {
            const messageFactory = await createMessageFactory()
            const partitionOffset = 20
            const msg = await createMessage({ partitionKey: PARTITION_COUNT + partitionOffset }, messageFactory)
            expect(msg!.messageId.streamPartition).toBe(partitionOffset)
        })

        it('selected random partition in range when partition count decreases', async () => {
            let partitionCount: number = MAX_PARTITION_COUNT - 1
            const messageFactory = await createMessageFactory({
                streamRegistry: createStreamRegistryCached({
                    partitionCount: 1
                })
            })
            while (partitionCount > 0) {
                const msg = await createMessage({}, messageFactory)
                expect(msg.messageId.streamPartition).toBeLessThan(partitionCount)
                partitionCount--
            }
        })
    })

    describe('message chains', () => {
        it('happy path', async () => {
            const messageFactory = await createMessageFactory()
            const msg1 = await createMessage({}, messageFactory)
            const msg2 = await createMessage({}, messageFactory)
            expect(msg2.getMessageID().msgChainId).toBe(msg1.getMessageID().msgChainId)
            expect(msg2.getPreviousMessageRef()).toEqual(msg1.getMessageRef())
        })

        it('partitions have separate chains', async () => {
            const messageFactory = await createMessageFactory()
            const msg1 = await createMessage({ explicitPartition: 10 }, messageFactory)
            const msg2 = await createMessage({ partitionKey: 'mock-key' }, messageFactory)
            const msg3 = await createMessage({ msgChainId: msg2.getMsgChainId(), explicitPartition: 20 }, messageFactory)
            expect(msg2.getMessageID().msgChainId).not.toBe(msg1.getMessageID().msgChainId)
            expect(msg3.getMessageID().msgChainId).not.toBe(msg1.getMessageID().msgChainId)
            expect(msg2.getPreviousMessageRef()).toBe(null)
            expect(msg3.getPreviousMessageRef()).toBe(null)
        })

        it('explicit msgChainId', async () => {
            const messageFactory = await createMessageFactory()
            const msg1 = await createMessage({ msgChainId: 'mock-id' }, messageFactory)
            const msg2 = await createMessage({}, messageFactory)
            const msg3 = await createMessage({ msgChainId: 'mock-id' }, messageFactory)
            expect(msg1.getMessageID().msgChainId).toBe('mock-id')
            expect(msg2.getMessageID().msgChainId).not.toBe('mock-id')
            expect(msg2.getPreviousMessageRef()).toBe(null)
            expect(msg3.getMessageID().msgChainId).toBe('mock-id')
            expect(msg3.getPreviousMessageRef()).toEqual(msg1.getMessageRef())
        })

        it('backdated', async () => {
            const messageFactory = await createMessageFactory()
            const msg1 = await createMessage({}, messageFactory)
            await expect(() => {
                return createMessage({ timestamp: 1000 }, messageFactory)
            }).rejects.toThrow('prevMessageRef must come before current')
            const msg3 = await createMessage({}, messageFactory)
            expect(msg3.getPreviousMessageRef()).toEqual(msg1.getMessageRef())
        })
    })
})

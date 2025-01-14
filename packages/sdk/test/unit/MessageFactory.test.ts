import { fastWallet, randomEthereumAddress } from '@streamr/test-utils'
import {
    MAX_PARTITION_COUNT,
    keyToArrayIndex,
    merge,
    toEthereumAddress,
    toStreamID,
    utf8ToBinary
} from '@streamr/utils'
import { mock } from 'jest-mock-extended'
import random from 'lodash/random'
import { createPrivateKeyAuthentication } from '../../src/Authentication'
import { ERC1271ContractFacade } from '../../src/contracts/ERC1271ContractFacade'
import { StreamRegistry } from '../../src/contracts/StreamRegistry'
import { GroupKey } from '../../src/encryption/GroupKey'
import { GroupKeyQueue } from '../../src/publish/GroupKeyQueue'
import { MessageFactory, MessageFactoryOptions } from '../../src/publish/MessageFactory'
import { PublishMetadata } from '../../src/publish/Publisher'
import { MessageSigner } from '../../src/signature/MessageSigner'
import { SignatureValidator } from '../../src/signature/SignatureValidator'
import { createGroupKeyQueue, createStreamRegistry } from '../test-utils/utils'
import {
    ContentType,
    EncryptionType,
    SignatureType,
    StreamMessage,
    StreamMessageType
} from './../../src/protocol/StreamMessage'

const WALLET = fastWallet()
const STREAM_ID = toStreamID('/path', toEthereumAddress(WALLET.address))
const CONTENT = { foo: 'bar' }
const TIMESTAMP = Date.parse('2001-02-03T04:05:06Z')
const PARTITION_COUNT = 50
const GROUP_KEY = GroupKey.generate()

const createMessageFactory = async (opts?: {
    streamRegistry?: StreamRegistry
    groupKeyQueue?: GroupKeyQueue
    erc1271ContractFacade?: ERC1271ContractFacade
}) => {
    const authentication = createPrivateKeyAuthentication(WALLET.privateKey)
    return new MessageFactory(
        merge<MessageFactoryOptions>(
            {
                streamId: STREAM_ID,
                authentication,
                streamRegistry: createStreamRegistry({
                    partitionCount: PARTITION_COUNT,
                    isPublicStream: false,
                    isStreamPublisher: true
                }),
                groupKeyQueue: await createGroupKeyQueue(authentication, GROUP_KEY),
                signatureValidator: new SignatureValidator(
                    opts?.erc1271ContractFacade ?? mock<ERC1271ContractFacade>()
                ),
                messageSigner: new MessageSigner(authentication)
            },
            opts
        )
    )
}

const createMessage = async (
    opts: Omit<PublishMetadata, 'timestamp'> & { timestamp?: number; explicitPartition?: number },
    messageFactory: MessageFactory,
    content: unknown | Uint8Array = CONTENT
): Promise<StreamMessage> => {
    return messageFactory.createMessage(
        content,
        merge(
            {
                timestamp: TIMESTAMP
            },
            opts
        ),
        opts.explicitPartition
    )
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
            prevMsgRef: undefined,
            messageType: StreamMessageType.MESSAGE,
            encryptionType: EncryptionType.AES,
            groupKeyId: GROUP_KEY.id,
            newGroupKey: undefined,
            signature: expect.any(Uint8Array),
            signatureType: SignatureType.SECP256K1,
            contentType: ContentType.JSON,
            content: expect.any(Uint8Array)
        })
    })

    it('happy path: ERC-1271', async () => {
        const contractAddress = randomEthereumAddress()
        const erc1271ContractFacade = mock<ERC1271ContractFacade>()
        erc1271ContractFacade.isValidSignature.mockResolvedValueOnce(true)
        const messageFactory = await createMessageFactory({
            erc1271ContractFacade
        })
        const msg = await createMessage(
            {
                erc1271Contract: contractAddress
            },
            messageFactory
        )
        expect(msg).toMatchObject({
            messageId: {
                msgChainId: expect.any(String),
                publisherId: contractAddress,
                sequenceNumber: 0,
                streamId: STREAM_ID,
                streamPartition: expect.toBeWithin(0, PARTITION_COUNT),
                timestamp: TIMESTAMP
            },
            prevMsgRef: undefined,
            messageType: StreamMessageType.MESSAGE,
            encryptionType: EncryptionType.AES,
            groupKeyId: GROUP_KEY.id,
            newGroupKey: undefined,
            signature: expect.any(Uint8Array),
            signatureType: SignatureType.ERC_1271,
            contentType: ContentType.JSON,
            content: expect.any(Uint8Array)
        })
    })

    it('throws if given erc1271Contract that is not signer for', async () => {
        const contractAddress = randomEthereumAddress()
        const erc1271ContractFacade = mock<ERC1271ContractFacade>()
        erc1271ContractFacade.isValidSignature.mockResolvedValueOnce(false)
        const messageFactory = await createMessageFactory({
            erc1271ContractFacade
        })
        await expect(() =>
            createMessage(
                {
                    erc1271Contract: contractAddress
                },
                messageFactory
            )
        ).rejects.toThrow('Signature validation failed')
    })

    it('throws if given non-ethereum address as erc1271Contract', async () => {
        const messageFactory = await createMessageFactory()
        await expect(() =>
            createMessage(
                {
                    erc1271Contract: 'not-an-ethereum-address'
                },
                messageFactory
            )
        ).rejects.toThrow('not a valid Ethereum address: "not-an-ethereum-address"')
    })

    it('public stream', async () => {
        const messageFactory = await createMessageFactory({
            streamRegistry: createStreamRegistry({
                isPublicStream: true
            })
        })
        const msg = await createMessage({}, messageFactory)
        expect(msg).toMatchObject({
            encryptionType: EncryptionType.NONE,
            groupKeyId: undefined,
            content: utf8ToBinary(JSON.stringify(CONTENT))
        })
    })

    it('metadata', async () => {
        const messageFactory = await createMessageFactory()
        const partitionKey = 'mock-partitionKey'
        const msgChainId = 'mock-msgChainId'
        const msg = await createMessage(
            {
                partitionKey,
                msgChainId
            },
            messageFactory
        )
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
            groupKeyQueue: await createGroupKeyQueue(
                createPrivateKeyAuthentication(WALLET.privateKey),
                GROUP_KEY,
                nextGroupKey
            )
        })
        const msg = await createMessage({}, messageFactory)
        expect(msg.groupKeyId).toBe(GROUP_KEY.id)
        expect(msg.newGroupKey).toMatchObject({
            id: nextGroupKey.id,
            data: expect.any(Uint8Array)
        })
        expect(GROUP_KEY.decryptNextGroupKey(msg.newGroupKey!)).toEqual(nextGroupKey)
    })

    it('not a publisher', async () => {
        const messageFactory = await createMessageFactory({
            streamRegistry: createStreamRegistry({
                isStreamPublisher: false
            })
        })
        return expect(() => createMessage({}, messageFactory)).rejects.toThrow(
            /You don't have permission to publish to this stream/
        )
    })

    it('detects binary content', async () => {
        const messageFactory = await createMessageFactory()
        const msg = await createMessage({}, messageFactory, utf8ToBinary('mock-content'))
        expect(msg).toMatchObject({
            contentType: ContentType.BINARY
        })
    })

    describe('partitions', () => {
        it('out of range', async () => {
            const messageFactory = await createMessageFactory()
            await expect(() => createMessage({ explicitPartition: -1 }, messageFactory)).rejects.toThrow(/out of range/)
            await expect(() => createMessage({ explicitPartition: PARTITION_COUNT }, messageFactory)).rejects.toThrow(
                /out of range/
            )
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
            expect(msg1.messageId.streamPartition).toBe(msg2.messageId.streamPartition)
        })

        it('same partition key maps to same partition', async () => {
            const messageFactory = await createMessageFactory()
            const partitionKey = `mock-partition-key-${random(Number.MAX_SAFE_INTEGER)}`
            const msg1 = await createMessage({ partitionKey }, messageFactory)
            const msg2 = await createMessage({ partitionKey }, messageFactory)
            expect(msg1.messageId.streamPartition).toBe(msg2.messageId.streamPartition)
        })

        it('numeric partition key maps to the partition if in range', async () => {
            const messageFactory = await createMessageFactory()
            const partitionKey = 10
            const msg = await createMessage({ partitionKey }, messageFactory)
            expect(msg.messageId.streamPartition).toBe(partitionKey)
        })

        it('numeric partition key maps to partition range', async () => {
            const messageFactory = await createMessageFactory()
            const partitionOffset = 20
            const msg = await createMessage({ partitionKey: PARTITION_COUNT + partitionOffset }, messageFactory)
            expect(msg.messageId.streamPartition).toBe(partitionOffset)
        })

        it('selected random partition in range when partition count decreases', async () => {
            let partitionCount: number = MAX_PARTITION_COUNT - 1
            const messageFactory = await createMessageFactory({
                streamRegistry: createStreamRegistry({
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
            expect(msg2.messageId.msgChainId).toBe(msg1.messageId.msgChainId)
            expect(msg2.prevMsgRef).toEqual(msg1.getMessageRef())
        })

        it('partitions have separate chains', async () => {
            const messageFactory = await createMessageFactory()
            const msg1 = await createMessage({ explicitPartition: 10 }, messageFactory)
            const msg2 = await createMessage({ partitionKey: 'mock-key' }, messageFactory)
            const msg3 = await createMessage(
                { msgChainId: msg2.getMsgChainId(), explicitPartition: 20 },
                messageFactory
            )
            expect(msg2.messageId.msgChainId).not.toBe(msg1.messageId.msgChainId)
            expect(msg3.messageId.msgChainId).not.toBe(msg1.messageId.msgChainId)
            expect(msg2.prevMsgRef).toBe(undefined)
            expect(msg3.prevMsgRef).toBe(undefined)
        })

        it('explicit msgChainId', async () => {
            const messageFactory = await createMessageFactory()
            const msg1 = await createMessage({ msgChainId: 'mock-id' }, messageFactory)
            const msg2 = await createMessage({}, messageFactory)
            const msg3 = await createMessage({ msgChainId: 'mock-id' }, messageFactory)
            expect(msg1.messageId.msgChainId).toBe('mock-id')
            expect(msg2.messageId.msgChainId).not.toBe('mock-id')
            expect(msg2.prevMsgRef).toBe(undefined)
            expect(msg3.messageId.msgChainId).toBe('mock-id')
            expect(msg3.prevMsgRef).toEqual(msg1.getMessageRef())
        })

        it('backdated', async () => {
            const messageFactory = await createMessageFactory()
            const msg1 = await createMessage({}, messageFactory)
            await expect(() => {
                return createMessage({ timestamp: 1000 }, messageFactory)
            }).rejects.toThrow('prevMessageRef must come before current')
            const msg3 = await createMessage({}, messageFactory)
            expect(msg3.prevMsgRef).toEqual(msg1.getMessageRef())
        })
    })
})

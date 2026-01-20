import 'reflect-metadata'

import { UserID, hexToBinary, toStreamID, toUserIdRaw, utf8ToBinary } from '@streamr/utils'
import { AsymmetricEncryptionType, ContentType, EncryptionType, GroupKeyRequest, GroupKeyResponse, SignatureType } from '@streamr/trackerless-network'
import { mock } from 'jest-mock-extended'
import { Identity } from '../../src/identity/Identity'
import { StreamMetadata } from '../../src/StreamMetadata'
import { ERC1271ContractFacade } from '../../src/contracts/ERC1271ContractFacade'
import { MessageSigner } from '../../src/signature/MessageSigner'
import { SignatureValidator } from '../../src/signature/SignatureValidator'
import { validateStreamMessage } from '../../src/utils/validateStreamMessage'
import { MOCK_CONTENT, createRandomIdentity } from '../test-utils/utils'
import { MessageID } from './../../src/protocol/MessageID'
import { MessageRef } from './../../src/protocol/MessageRef'
import { StreamMessage, StreamMessageType } from './../../src/protocol/StreamMessage'
import type { StrictStreamrClientConfig } from '../../src/ConfigTypes'
import { DestroySignal } from '../../src/DestroySignal'

const groupKeyRequestToStreamMessage = async (
    groupKeyRequest: GroupKeyRequest,
    messageId: MessageID,
    prevMsgRef: MessageRef | undefined,
    identity: Identity
): Promise<StreamMessage> => {
    const messageSigner = new MessageSigner(identity)
    return messageSigner.createSignedMessage({
        messageId,
        prevMsgRef,
        content: GroupKeyRequest.toBinary(groupKeyRequest),
        messageType: StreamMessageType.GROUP_KEY_REQUEST,
        contentType: ContentType.JSON,
        encryptionType: EncryptionType.NONE,
    }, SignatureType.ECDSA_SECP256K1_EVM)
}

const groupKeyResponseToStreamMessage = async (
    groupKeyResponse: GroupKeyResponse,
    messageId: MessageID,
    prevMsgRef: MessageRef | undefined,
    identity: Identity
): Promise<StreamMessage> => {
    const messageSigner = new MessageSigner(identity)
    return messageSigner.createSignedMessage({
        messageId,
        prevMsgRef,
        content: GroupKeyResponse.toBinary(groupKeyResponse),
        messageType: StreamMessageType.GROUP_KEY_RESPONSE,
        contentType: ContentType.JSON,
        encryptionType: EncryptionType.NONE,
    }, SignatureType.ECDSA_SECP256K1_EVM)
}

describe('Validator2', () => {

    let getStreamMetadata: (streamId: string) => Promise<StreamMetadata>
    let isPublisher: (userId: UserID, streamId: string) => Promise<boolean>
    let isSubscriber: (userId: UserID, streamId: string) => Promise<boolean>
    let publisherIdentity: Identity
    let subscriberIdentity: Identity
    let msg: StreamMessage
    let msgWithNewGroupKey: StreamMessage
    let msgWithPrevMsgRef: StreamMessage
    let groupKeyRequest: StreamMessage
    let groupKeyResponse: StreamMessage

    const getValidator = () => {
        return {
            validate: (msg: StreamMessage) => validateStreamMessage(
                msg,
                { 
                    getStreamMetadata,
                    isStreamPublisher: (streamId: string, userId: UserID) => isPublisher(userId, streamId),
                    isStreamSubscriber: (streamId: string, userId: UserID) => isSubscriber(userId, streamId)
                } as any,
                new SignatureValidator(mock<ERC1271ContractFacade>(), new DestroySignal()),
                {
                    validation: {
                        permissions: true,
                        partitions: true
                    }
                } as StrictStreamrClientConfig
            )
        }
    }

    beforeAll(async () => {
        publisherIdentity = await createRandomIdentity()
        subscriberIdentity = await createRandomIdentity()
    })

    beforeEach(async () => {
        const publisher = await publisherIdentity.getUserId()
        const subscriber = await subscriberIdentity.getUserId()
        // Default stubs
        getStreamMetadata = async () => ({
            partitions: 10
        })
        isPublisher = async (userId: UserID, streamId: string) => {
            return userId === publisher && streamId === 'streamId'
        }
        isSubscriber = async (userId: UserID, streamId: string) => {
            return userId === subscriber && streamId === 'streamId'
        }

        const publisherSigner = new MessageSigner(publisherIdentity)

        msg = await publisherSigner.createSignedMessage({
            messageId: new MessageID(toStreamID('streamId'), 0, 0, 0, publisher, 'msgChainId'),
            messageType: StreamMessageType.MESSAGE,
            content: MOCK_CONTENT,
            contentType: ContentType.JSON,
            encryptionType: EncryptionType.NONE,
        }, SignatureType.ECDSA_SECP256K1_EVM)

        msgWithNewGroupKey = await publisherSigner.createSignedMessage({
            messageId: new MessageID(toStreamID('streamId'), 0, 0, 0, publisher, 'msgChainId'),
            messageType: StreamMessageType.MESSAGE,
            content: MOCK_CONTENT,
            newGroupKey: { id: 'groupKeyId', data: hexToBinary('0x1111') },
            contentType: ContentType.JSON,
            encryptionType: EncryptionType.NONE,
        }, SignatureType.ECDSA_SECP256K1_EVM)
        expect(msg.signature).not.toEqualBinary(msgWithNewGroupKey.signature)

        msgWithPrevMsgRef = await publisherSigner.createSignedMessage({
            messageId: new MessageID(toStreamID('streamId'), 0, 2000, 0, publisher, 'msgChainId'),
            messageType: StreamMessageType.MESSAGE,
            content: MOCK_CONTENT,
            prevMsgRef: new MessageRef(1000, 0),
            contentType: ContentType.JSON,
            encryptionType: EncryptionType.NONE
        }, SignatureType.ECDSA_SECP256K1_EVM)
        expect(msg.signature).not.toEqualBinary(msgWithPrevMsgRef.signature)

        groupKeyRequest = await groupKeyRequestToStreamMessage({
            requestId: 'requestId',
            recipientId: toUserIdRaw(publisher),
            publicKey: Buffer.from('rsaPublicKey', 'utf8'),
            groupKeyIds: ['groupKeyId1', 'groupKeyId2'],
            encryptionType: AsymmetricEncryptionType.RSA,
        }, new MessageID(toStreamID('streamId'), 0, 0, 0, subscriber, 'msgChainId'), undefined, subscriberIdentity)

        groupKeyResponse = await groupKeyResponseToStreamMessage({
            requestId: 'requestId',
            recipientId: toUserIdRaw(subscriber),
            groupKeys: [
                { id: 'groupKeyId1', data: hexToBinary('0x1111') },
                { id: 'groupKeyId2', data: hexToBinary('0x2222') },
            ],
            encryptionType: AsymmetricEncryptionType.RSA,
        }, new MessageID(toStreamID('streamId'), 0, 0, 0, publisher, 'msgChainId'), undefined, publisherIdentity)
    })

    describe('validate(unknown message type)', () => {
        it('throws on unknown message type', async () => {
            (msg as any).messageType = 666
            await expect(getValidator().validate(msg)).rejects.toThrow(Error)
        })
    })

    describe('validate(message)', () => {
        it('accepts valid messages', async () => {
            await getValidator().validate(msg)
        })

        it('accepts valid messages with a new group key', async () => {
            await getValidator().validate(msgWithNewGroupKey)
        })

        it('accepts valid messages with previous message reference', async () => {
            await getValidator().validate(msgWithPrevMsgRef)
        })

        it('rejects invalid signatures', async () => {
            const invalidMsg = new StreamMessage({
                ...msg,
                signature: Buffer.from(msg.signature).reverse()
            })

            await expect(getValidator().validate(invalidMsg)).rejects.toThrowStreamrClientError({
                code: 'INVALID_SIGNATURE'
            })
        })

        it('rejects tampered content', async () => {
            const invalidMsg = new StreamMessage({
                ...msg,
                content: utf8ToBinary('{"attack":true}')
            })

            await expect(getValidator().validate(invalidMsg)).rejects.toThrowStreamrClientError({
                code: 'INVALID_SIGNATURE'
            })
        })

        it('rejects tampered newGroupKey', async () => {
            const invalidMsg = new StreamMessage({
                ...msg,
                newGroupKey: { id: 'foo', data: msgWithNewGroupKey.newGroupKey!.data }
            })

            await expect(getValidator().validate(invalidMsg)).rejects.toThrowStreamrClientError({
                code: 'INVALID_SIGNATURE'
            })
        })

        it('rejects messages from unpermitted publishers', async () => {
            isPublisher = jest.fn().mockResolvedValue(false)

            await expect(getValidator().validate(msg)).rejects.toThrowStreamrClientError({
                code: 'MISSING_PERMISSION'
            })
            expect(isPublisher).toHaveBeenCalledWith(msg.getPublisherId(), msg.getStreamId())
        })

        it('rejects if getStreamMetadata rejects', async () => {
            const testError = new Error('test error')
            getStreamMetadata = jest.fn().mockRejectedValue(testError)

            await expect(getValidator().validate(msg)).rejects.toThrow(testError)
        })

        it('rejects if isPublisher rejects', async () => {
            const testError = new Error('test error')
            isPublisher = jest.fn().mockRejectedValue(testError)
            await expect(getValidator().validate(msg)).rejects.toThrow(testError)
        })
    })

    describe('validate(group key request)', () => {
        it('accepts valid group key requests', async () => {
            await getValidator().validate(groupKeyRequest)
        })

        it('rejects group key requests on unexpected streams', async () => {
            groupKeyRequest.getStreamId = jest.fn().mockReturnValue('foo')

            await expect(getValidator().validate(groupKeyRequest)).rejects.toThrowStreamrClientError({
                code: 'MISSING_PERMISSION'
            })
        })

        it('rejects invalid signatures', async () => {
            const invalidGroupKeyRequest = new StreamMessage({
                ...groupKeyRequest,
                signature: Buffer.from(groupKeyRequest.signature).reverse()
            })

            await expect(getValidator().validate(invalidGroupKeyRequest)).rejects.toThrowStreamrClientError({
                code: 'INVALID_SIGNATURE'
            })
        })

        it('rejects messages to invalid publishers', async () => {
            isPublisher = jest.fn().mockResolvedValue(false)
            const publisher = await publisherIdentity.getUserId()

            await expect(getValidator().validate(groupKeyRequest)).rejects.toThrowStreamrClientError({
                code: 'MISSING_PERMISSION'
            })
            expect(isPublisher).toHaveBeenCalledWith(publisher, 'streamId')
        })

        it('rejects messages from unpermitted subscribers', async () => {
            isSubscriber = jest.fn().mockResolvedValue(false)
            const subscriber = await subscriberIdentity.getUserId()

            await expect(getValidator().validate(groupKeyRequest)).rejects.toThrowStreamrClientError({
                code: 'MISSING_PERMISSION'
            })
            expect(isSubscriber).toHaveBeenCalledWith(subscriber, 'streamId')
        })

        it('rejects if isPublisher rejects', async () => {
            const testError = new Error('test error')
            isPublisher = jest.fn().mockRejectedValue(testError)
            await expect(getValidator().validate(groupKeyRequest)).rejects.toThrow(testError)
        })

        it('rejects if isSubscriber rejects', async () => {
            const testError = new Error('test error')
            isSubscriber = jest.fn().mockRejectedValue(testError)
            await expect(getValidator().validate(groupKeyRequest)).rejects.toThrow(testError)
        })
    })

    describe('validate(group key response)', () => {
        it('accepts valid group key responses', async () => {
            await getValidator().validate(groupKeyResponse)
        })

        it('rejects invalid signatures', async () => {
            const invalidGroupKeyResponse = new StreamMessage({
                ...groupKeyResponse,
                signature: Buffer.from(groupKeyResponse.signature).reverse()
            })

            await expect(getValidator().validate(invalidGroupKeyResponse)).rejects.toThrowStreamrClientError({
                code: 'INVALID_SIGNATURE'
            })
        })

        it('rejects group key responses on unexpected streams', async () => {
            groupKeyResponse.getStreamId = jest.fn().mockReturnValue('foo')

            await expect(getValidator().validate(groupKeyResponse)).rejects.toThrowStreamrClientError({
                code: 'MISSING_PERMISSION'
            })
        })

        it('rejects messages from invalid publishers', async () => {
            isPublisher = jest.fn().mockResolvedValue(false)
            const publisher = await publisherIdentity.getUserId()

            await expect(getValidator().validate(groupKeyResponse)).rejects.toThrowStreamrClientError({
                code: 'MISSING_PERMISSION'
            })
            expect(isPublisher).toHaveBeenCalledWith(publisher, 'streamId')
        })

        it('rejects messages to unpermitted subscribers', async () => {
            isSubscriber = jest.fn().mockResolvedValue(false)
            const subscriber = await subscriberIdentity.getUserId()

            await expect(getValidator().validate(groupKeyResponse)).rejects.toThrowStreamrClientError({
                code: 'MISSING_PERMISSION'
            })
            expect(isSubscriber).toHaveBeenCalledWith(subscriber, 'streamId')
        })

        it('rejects if isPublisher rejects', async () => {
            const testError = new Error('test error')
            isPublisher = jest.fn().mockRejectedValue(testError)
            await expect(getValidator().validate(groupKeyResponse)).rejects.toThrow(testError)
        })

        it('rejects if isSubscriber rejects', async () => {
            const testError = new Error('test error')
            isSubscriber = jest.fn().mockRejectedValue(testError)
            await expect(getValidator().validate(groupKeyResponse)).rejects.toThrow(testError)
        })
    })
})

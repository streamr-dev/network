import 'reflect-metadata'

import { UserID, hexToBinary, toStreamID, utf8ToBinary, toUserIdOld } from '@streamr/utils'
import assert from 'assert'
import { mock } from 'jest-mock-extended'
import { Authentication } from '../../src/Authentication'
import { Stream } from '../../src/Stream'
import { ERC1271ContractFacade } from '../../src/contracts/ERC1271ContractFacade'
import {
    convertGroupKeyRequestToBytes,
    convertGroupKeyResponseToBytes
} from '../../src/protocol/oldStreamMessageBinaryUtils'
import { MessageSigner } from '../../src/signature/MessageSigner'
import { SignatureValidator } from '../../src/signature/SignatureValidator'
import { validateStreamMessage } from '../../src/utils/validateStreamMessage'
import { MOCK_CONTENT, createRandomAuthentication } from '../test-utils/utils'
import { EncryptedGroupKey } from './../../src/protocol/EncryptedGroupKey'
import { GroupKeyRequest } from './../../src/protocol/GroupKeyRequest'
import { GroupKeyResponse } from './../../src/protocol/GroupKeyResponse'
import { MessageID } from './../../src/protocol/MessageID'
import { MessageRef } from './../../src/protocol/MessageRef'
import { ContentType, EncryptionType, SignatureType, StreamMessage, StreamMessageType } from './../../src/protocol/StreamMessage'
import { ValidationError } from './../../src/protocol/ValidationError'

const groupKeyMessageToStreamMessage = async (
    groupKeyMessage: GroupKeyRequest | GroupKeyResponse,
    messageId: MessageID,
    prevMsgRef: MessageRef | undefined,
    authentication: Authentication
): Promise<StreamMessage> => {
    const messageSigner = new MessageSigner(authentication)
    return messageSigner.createSignedMessage({
        messageId,
        prevMsgRef,
        content: groupKeyMessage instanceof GroupKeyRequest
            ? convertGroupKeyRequestToBytes(groupKeyMessage)
            : convertGroupKeyResponseToBytes(groupKeyMessage),
        messageType: groupKeyMessage instanceof GroupKeyRequest
            ? StreamMessageType.GROUP_KEY_REQUEST
            : StreamMessageType.GROUP_KEY_RESPONSE,
        contentType: ContentType.JSON,
        encryptionType: EncryptionType.NONE,
    }, SignatureType.SECP256K1)
}

const publisherAuthentication = createRandomAuthentication()
const subscriberAuthentication = createRandomAuthentication()

describe('Validator2', () => {
    let getStream: (streamId: string) => Promise<Stream>
    let isPublisher: (userId: UserID, streamId: string) => Promise<boolean>
    let isSubscriber: (userId: UserID, streamId: string) => Promise<boolean>
    let msg: StreamMessage
    let msgWithNewGroupKey: StreamMessage
    let msgWithPrevMsgRef: StreamMessage
    let groupKeyRequest: StreamMessage
    let groupKeyResponse: StreamMessage

    const getValidator = () => {
        return {
            validate: (msg: StreamMessage) => validateStreamMessage(msg, { 
                getStream,
                isStreamPublisher: (streamId: string, userId: UserID) => isPublisher(userId, streamId),
                isStreamSubscriber: (streamId: string, userId: UserID) => isSubscriber(userId, streamId)
            } as any, new SignatureValidator(mock<ERC1271ContractFacade>()))
        }
    }

    beforeEach(async () => {
        const publisher = await publisherAuthentication.getUserId()
        const subscriber = await subscriberAuthentication.getUserId()
        // Default stubs
        getStream = async () => {
            return {
                getMetadata: () => ({
                    partitions: 10
                })
            } as any
        }
        isPublisher = async (userId: UserID, streamId: string) => {
            return userId === publisher && streamId === 'streamId'
        }
        isSubscriber = async (userId: UserID, streamId: string) => {
            return userId === subscriber && streamId === 'streamId'
        }

        const publisherSigner = new MessageSigner(publisherAuthentication)

        msg = await publisherSigner.createSignedMessage({
            messageId: new MessageID(toStreamID('streamId'), 0, 0, 0, toUserIdOld(publisher), 'msgChainId'),
            messageType: StreamMessageType.MESSAGE,
            content: MOCK_CONTENT,
            contentType: ContentType.JSON,
            encryptionType: EncryptionType.NONE,
        }, SignatureType.SECP256K1)

        msgWithNewGroupKey = await publisherSigner.createSignedMessage({
            messageId: new MessageID(toStreamID('streamId'), 0, 0, 0, toUserIdOld(publisher), 'msgChainId'),
            messageType: StreamMessageType.MESSAGE,
            content: MOCK_CONTENT,
            newGroupKey: new EncryptedGroupKey('groupKeyId', hexToBinary('0x1111')),
            contentType: ContentType.JSON,
            encryptionType: EncryptionType.NONE,
        }, SignatureType.SECP256K1)
        assert.notStrictEqual(msg.signature, msgWithNewGroupKey.signature)

        msgWithPrevMsgRef = await publisherSigner.createSignedMessage({
            messageId: new MessageID(toStreamID('streamId'), 0, 2000, 0, toUserIdOld(publisher), 'msgChainId'),
            messageType: StreamMessageType.MESSAGE,
            content: MOCK_CONTENT,
            prevMsgRef: new MessageRef(1000, 0),
            contentType: ContentType.JSON,
            encryptionType: EncryptionType.NONE
        }, SignatureType.SECP256K1)
        assert.notStrictEqual(msg.signature, msgWithPrevMsgRef.signature)

        groupKeyRequest = await groupKeyMessageToStreamMessage(new GroupKeyRequest({
            requestId: 'requestId',
            recipient: toUserIdOld(publisher),
            rsaPublicKey: 'rsaPublicKey',
            groupKeyIds: ['groupKeyId1', 'groupKeyId2']
        }), new MessageID(toStreamID('streamId'), 0, 0, 0, toUserIdOld(subscriber), 'msgChainId'), undefined, subscriberAuthentication)

        groupKeyResponse = await groupKeyMessageToStreamMessage(new GroupKeyResponse({
            requestId: 'requestId',
            recipient: toUserIdOld(subscriber),
            encryptedGroupKeys: [
                new EncryptedGroupKey('groupKeyId1', hexToBinary('0x1111')),
                new EncryptedGroupKey('groupKeyId2', hexToBinary('0x2222'))
            ],
        }), new MessageID(toStreamID('streamId'), 0, 0, 0, toUserIdOld(publisher), 'msgChainId'), undefined, publisherAuthentication)
    })

    describe('validate(unknown message type)', () => {
        it('throws on unknown message type', async () => {
            (msg as any).messageType = 666
            await assert.rejects(getValidator().validate(msg), (err: Error) => {
                assert(err instanceof Error, err.message)
                return true
            })
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

            await assert.rejects(getValidator().validate(invalidMsg), (err: Error) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                return true
            })
        })

        it('rejects tampered content', async () => {
            const invalidMsg = new StreamMessage({
                ...msg,
                content: utf8ToBinary('{"attack":true}')
            })

            await assert.rejects(getValidator().validate(invalidMsg), (err: Error) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                return true
            })
        })

        it('rejects tampered newGroupKey', async () => {
            const invalidMsg = new StreamMessage({
                ...msg,
                newGroupKey: new EncryptedGroupKey('foo', msgWithNewGroupKey.newGroupKey!.data)
            })

            await assert.rejects(getValidator().validate(invalidMsg), (err: Error) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                return true
            })
        })

        it('rejects messages from unpermitted publishers', async () => {
            isPublisher = jest.fn().mockResolvedValue(false)

            await assert.rejects(getValidator().validate(msg), (err: Error) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                expect(isPublisher).toHaveBeenCalledWith(msg.getPublisherId(), msg.getStreamId())
                return true
            })
        })

        it('rejects if getStream rejects', async () => {
            const testError = new Error('test error')
            getStream = jest.fn().mockRejectedValue(testError)

            await assert.rejects(getValidator().validate(msg), (err: Error) => {
                assert(err === testError)
                return true
            })
        })

        it('rejects if isPublisher rejects', async () => {
            const testError = new Error('test error')
            isPublisher = jest.fn().mockRejectedValue(testError)
            await assert.rejects(getValidator().validate(msg), (err: Error) => {
                assert(err === testError)
                return true
            })
        })
    })

    describe('validate(group key request)', () => {
        it('accepts valid group key requests', async () => {
            await getValidator().validate(groupKeyRequest)
        })

        it('rejects group key requests on unexpected streams', async () => {
            groupKeyRequest.getStreamId = jest.fn().mockReturnValue('foo')

            await assert.rejects(getValidator().validate(groupKeyRequest), (err: Error) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                return true
            })
        })

        it('rejects invalid signatures', async () => {
            const invalidGroupKeyRequest = new StreamMessage({
                ...groupKeyRequest,
                signature: Buffer.from(groupKeyRequest.signature).reverse()
            })

            await assert.rejects(getValidator().validate(invalidGroupKeyRequest), (err: Error) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                return true
            })
        })

        it('rejects messages to invalid publishers', async () => {
            isPublisher = jest.fn().mockResolvedValue(false)
            const publisher = await publisherAuthentication.getAddress()

            await assert.rejects(getValidator().validate(groupKeyRequest), (err: Error) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                expect(isPublisher).toHaveBeenCalledWith(publisher, 'streamId')
                return true
            })
        })

        it('rejects messages from unpermitted subscribers', async () => {
            isSubscriber = jest.fn().mockResolvedValue(false)
            const subscriber = await subscriberAuthentication.getAddress()

            await assert.rejects(getValidator().validate(groupKeyRequest), (err: Error) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                expect(isSubscriber).toHaveBeenCalledWith(subscriber, 'streamId')
                return true
            })
        })

        it('rejects if isPublisher rejects', async () => {
            const testError = new Error('test error')
            isPublisher = jest.fn().mockRejectedValue(testError)
            await assert.rejects(getValidator().validate(groupKeyRequest), (err: Error) => {
                assert(err === testError)
                return true
            })
        })

        it('rejects if isSubscriber rejects', async () => {
            const testError = new Error('test error')
            isSubscriber = jest.fn().mockRejectedValue(testError)
            await assert.rejects(getValidator().validate(groupKeyRequest), (err: Error) => {
                assert(err === testError)
                return true
            })
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

            await assert.rejects(getValidator().validate(invalidGroupKeyResponse), (err: Error) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                return true
            })
        })

        it('rejects group key responses on unexpected streams', async () => {
            groupKeyResponse.getStreamId = jest.fn().mockReturnValue('foo')

            await assert.rejects(getValidator().validate(groupKeyResponse), (err: Error) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                return true
            })
        })

        it('rejects messages from invalid publishers', async () => {
            isPublisher = jest.fn().mockResolvedValue(false)
            const publisher = await publisherAuthentication.getAddress()

            await assert.rejects(getValidator().validate(groupKeyResponse), (err: Error) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                expect(isPublisher).toHaveBeenCalledWith(publisher, 'streamId')
                return true
            })
        })

        it('rejects messages to unpermitted subscribers', async () => {
            isSubscriber = jest.fn().mockResolvedValue(false)
            const subscriber = await subscriberAuthentication.getAddress()

            await assert.rejects(getValidator().validate(groupKeyResponse), (err: Error) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                expect(isSubscriber).toHaveBeenCalledWith(subscriber, 'streamId')
                return true
            })
        })

        it('rejects if isPublisher rejects', async () => {
            const testError = new Error('test error')
            isPublisher = jest.fn().mockRejectedValue(testError)
            await assert.rejects(getValidator().validate(groupKeyResponse), (err: Error) => {
                assert(err === testError)
                return true
            })
        })

        it('rejects if isSubscriber rejects', async () => {
            const testError = new Error('test error')
            isSubscriber = jest.fn().mockRejectedValue(testError)
            await assert.rejects(getValidator().validate(groupKeyResponse), (err: Error) => {
                assert(err === testError)
                return true
            })
        })
    })
})

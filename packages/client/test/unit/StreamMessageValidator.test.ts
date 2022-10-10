import assert from 'assert'

import {
    toStreamID,
    EthereumAddress,
    StreamMessage,
    MessageID,
    GroupKeyMessage,
    MessageRef,
    EncryptedGroupKey,
    GroupKeyRequest,
    GroupKeyResponse,
    ValidationError
} from 'streamr-client-protocol'
import { Authentication } from '../../src/Authentication'
import { createSignedMessage } from '../../src/publish/MessageFactory'
import StreamMessageValidator, { StreamMetadata } from '../../src/StreamMessageValidator'
import { createRandomAuthentication } from '../test-utils/utils'

const groupKeyMessageToStreamMessage = async (
    groupKeyMessage: GroupKeyMessage, 
    messageId: MessageID, 
    prevMsgRef: MessageRef | null,
    authentication: Authentication
): Promise<StreamMessage> => {
    return createSignedMessage({
        messageId,
        prevMsgRef,
        serializedContent: groupKeyMessage.serialize(),
        messageType: groupKeyMessage.messageType,
        authentication
    })
}

const publisherAuthentication = createRandomAuthentication()
const subscriberAuthentication = createRandomAuthentication()

describe('StreamMessageValidator', () => {
    let getStream: (streamId: string) => Promise<StreamMetadata>
    let isPublisher: (address: EthereumAddress, streamId: string) => Promise<boolean>
    let isSubscriber: (address: EthereumAddress, streamId: string) => Promise<boolean>
    let verify: ((address: EthereumAddress, payload: string, signature: string) => boolean) | undefined
    let msg: StreamMessage
    let msgWithNewGroupKey: StreamMessage
    let msgWithPrevMsgRef: StreamMessage
    let groupKeyRequest: StreamMessage
    let groupKeyResponse: StreamMessage

    const defaultGetStreamResponse = {
        partitions: 10
    }

    const getValidator = (customConfig?: any) => {
        if (customConfig) {
            return new StreamMessageValidator(customConfig)
        } else {
            return new StreamMessageValidator({
                getStream, isPublisher, isSubscriber, verify
            })
        }
    }

    beforeEach(async () => {
        const publisher = await publisherAuthentication.getAddress()
        const subscriber = await subscriberAuthentication.getAddress()
        // Default stubs
        getStream = jest.fn().mockResolvedValue(defaultGetStreamResponse)
        isPublisher = async (address: EthereumAddress, streamId: string) => {
            return address === publisher && streamId === 'streamId'
        }
        isSubscriber = async (address: EthereumAddress, streamId: string) => {
            return address === subscriber && streamId === 'streamId'
        }
        verify = undefined // use default impl by default

        msg = await createSignedMessage({
            messageId: new MessageID(toStreamID('streamId'), 0, 0, 0, publisher, 'msgChainId'),
            serializedContent: JSON.stringify({}),
            authentication: publisherAuthentication
        })

        msgWithNewGroupKey = await createSignedMessage({
            messageId: new MessageID(toStreamID('streamId'), 0, 0, 0, publisher, 'msgChainId'),
            serializedContent: JSON.stringify({}),
            newGroupKey: new EncryptedGroupKey('groupKeyId', 'encryptedGroupKeyHex'),
            authentication: publisherAuthentication
        })
        assert.notStrictEqual(msg.signature, msgWithNewGroupKey.signature)

        msgWithPrevMsgRef = await createSignedMessage({
            messageId: new MessageID(toStreamID('streamId'), 0, 2000, 0, publisher, 'msgChainId'),
            serializedContent: JSON.stringify({}),
            prevMsgRef: new MessageRef(1000, 0),
            authentication: publisherAuthentication
        })
        assert.notStrictEqual(msg.signature, msgWithPrevMsgRef.signature)

        groupKeyRequest = await groupKeyMessageToStreamMessage(new GroupKeyRequest({
            requestId: 'requestId',
            recipient: publisher.toLowerCase(),
            rsaPublicKey: 'rsaPublicKey',
            groupKeyIds: ['groupKeyId1', 'groupKeyId2']
        }), new MessageID(toStreamID('streamId'), 0, 0, 0, subscriber, 'msgChainId'), null, subscriberAuthentication)

        groupKeyResponse = await groupKeyMessageToStreamMessage(new GroupKeyResponse({
            requestId: 'requestId',
            recipient: subscriber.toLowerCase(),
            encryptedGroupKeys: [
                new EncryptedGroupKey('groupKeyId1', 'encryptedKey1'),
                new EncryptedGroupKey('groupKeyId2', 'encryptedKey2')
            ],
        }), new MessageID(toStreamID('streamId'), 0, 0, 0, publisher, 'msgChainId'), null, publisherAuthentication)
    })

    describe('validate(unknown message type)', () => {
        it('throws on unknown message type', async () => {
            msg.messageType = 666
            await assert.rejects(getValidator().validate(msg), (err: Error) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
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

        it('rejects unsigned messages', async () => {
            msg.signature = null
            msg.signatureType = StreamMessage.SIGNATURE_TYPES.NONE

            await assert.rejects(getValidator().validate(msg), (err: Error) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                expect(getStream).toHaveBeenCalledWith(msg.getStreamId())
                return true
            })
        })

        it('rejects invalid signatures', async () => {
            msg.signature = msg.signature!.replace('a', 'b')

            await assert.rejects(getValidator().validate(msg), (err: Error) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                return true
            })
        })

        it('rejects tampered content', async () => {
            msg.serializedContent = '{"attack":true}'

            await assert.rejects(getValidator().validate(msg), (err: Error) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                return true
            })
        })

        it('rejects tampered newGroupKey', async () => {
            msgWithNewGroupKey.newGroupKey!.groupKeyId = 'foo'

            await assert.rejects(getValidator().validate(msgWithNewGroupKey), (err: Error) => {
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

        it('rejects messages with unknown signature type', async () => {
            msg.signatureType = 666
            await assert.rejects(getValidator().validate(msg))
        })

        it('rejects if getStream rejects', async () => {
            msg.signature = null
            msg.signatureType = StreamMessage.SIGNATURE_TYPES.NONE
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

        it('rejects with ValidationError if verify throws', async () => {
            const testError = new Error('test error')
            verify = jest.fn().mockImplementation(() => {
                throw testError
            })
            await assert.rejects(getValidator().validate(msg), (err: Error) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                return true
            })
        })
    })

    describe('validate(group key request)', () => {
        it('accepts valid group key requests', async () => {
            await getValidator().validate(groupKeyRequest)
        })

        it('rejects unsigned group key requests', async () => {
            groupKeyRequest.signature = null
            groupKeyRequest.signatureType = StreamMessage.SIGNATURE_TYPES.NONE

            await assert.rejects(getValidator().validate(groupKeyRequest), (err: Error) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                return true
            })
        })

        it('rejects group key requests on unexpected streams', async () => {
            groupKeyRequest.getStreamId = jest.fn().mockReturnValue('foo')

            await assert.rejects(getValidator().validate(groupKeyRequest), (err: Error) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                return true
            })
        })

        it('rejects invalid signatures', async () => {
            groupKeyRequest.signature = groupKeyRequest.signature!.replace('a', 'b')

            await assert.rejects(getValidator().validate(groupKeyRequest), (err: Error) => {
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

        it('rejects with ValidationError if verify throws', async () => {
            const testError = new Error('test error')
            verify = jest.fn().mockImplementation(() => {
                throw testError
            })
            await assert.rejects(getValidator().validate(groupKeyRequest), (err: Error) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                return true
            })
        })
    })

    describe('validate(group key response)', () => {
        it('accepts valid group key responses', async () => {
            await getValidator().validate(groupKeyResponse)
        })

        it('rejects unsigned group key responses', async () => {
            groupKeyResponse.signature = null
            groupKeyResponse.signatureType = StreamMessage.SIGNATURE_TYPES.NONE

            await assert.rejects(getValidator().validate(groupKeyResponse), (err: Error) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                return true
            })
        })

        it('rejects invalid signatures', async () => {
            groupKeyResponse.signature = groupKeyResponse.signature!.replace('a', 'b')

            await assert.rejects(getValidator().validate(groupKeyResponse), (err: Error) => {
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

        it('rejects with ValidationError if verify throws', async () => {
            const testError = new Error('test error')
            verify = jest.fn().mockImplementation(() => {
                throw testError
            })
            await assert.rejects(getValidator().validate(groupKeyResponse), (err: Error) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                return true
            })
        })
    })
})

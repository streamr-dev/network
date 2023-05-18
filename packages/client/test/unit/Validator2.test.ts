import {
    EncryptedGroupKey,
    GroupKeyMessage,
    GroupKeyRequest,
    GroupKeyResponse,
    MessageID,
    MessageRef,
    StreamMessage,
    ValidationError,
    toStreamID
} from '@streamr/protocol'
import { EthereumAddress } from '@streamr/utils'
import assert from 'assert'
import { Authentication } from '../../src/Authentication'
import { Stream } from '../../src/Stream'
import { Validator } from '../../src/Validator'
import { createSignedMessage } from '../../src/publish/MessageFactory'
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

describe('Validator2', () => {
    let getStream: (streamId: string) => Promise<Stream>
    let isPublisher: (address: EthereumAddress, streamId: string) => Promise<boolean>
    let isSubscriber: (address: EthereumAddress, streamId: string) => Promise<boolean>
    let msg: StreamMessage
    let msgWithNewGroupKey: StreamMessage
    let msgWithPrevMsgRef: StreamMessage
    let groupKeyRequest: StreamMessage
    let groupKeyResponse: StreamMessage

    const getValidator = () => new Validator(
        { 
            getStream,
            isStreamPublisher: (streamId: string, address: EthereumAddress) => isPublisher(address, streamId),
            isStreamSubscriber: (streamId: string, address: EthereumAddress) => isSubscriber(address, streamId)
        } as any,
    )

    beforeEach(async () => {
        const publisher = await publisherAuthentication.getAddress()
        const subscriber = await subscriberAuthentication.getAddress()
        // Default stubs
        getStream = async () => {
            return {
                getMetadata: () => ({
                    partitions: 10
                })
            } as any
        }
        isPublisher = async (address: EthereumAddress, streamId: string) => {
            return address === publisher && streamId === 'streamId'
        }
        isSubscriber = async (address: EthereumAddress, streamId: string) => {
            return address === subscriber && streamId === 'streamId'
        }

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
            recipient: publisher,
            rsaPublicKey: 'rsaPublicKey',
            groupKeyIds: ['groupKeyId1', 'groupKeyId2']
        }), new MessageID(toStreamID('streamId'), 0, 0, 0, subscriber, 'msgChainId'), null, subscriberAuthentication)

        groupKeyResponse = await groupKeyMessageToStreamMessage(new GroupKeyResponse({
            requestId: 'requestId',
            recipient: subscriber,
            encryptedGroupKeys: [
                new EncryptedGroupKey('groupKeyId1', 'encryptedKey1'),
                new EncryptedGroupKey('groupKeyId2', 'encryptedKey2')
            ],
        }), new MessageID(toStreamID('streamId'), 0, 0, 0, publisher, 'msgChainId'), null, publisherAuthentication)
    })

    describe('validate(unknown message type)', () => {
        it('throws on unknown message type', async () => {
            (msg as any).messageType = 666
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

        it('rejects invalid signatures', async () => {
            msg.signature = msg.signature.replace('a', 'b')

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
            groupKeyRequest.signature = groupKeyRequest.signature.replace('a', 'b')

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
    })

    describe('validate(group key response)', () => {
        it('accepts valid group key responses', async () => {
            await getValidator().validate(groupKeyResponse)
        })

        it('rejects invalid signatures', async () => {
            groupKeyResponse.signature = groupKeyResponse.signature.replace('a', 'b')

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
    })
})

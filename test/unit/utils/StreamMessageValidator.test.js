import assert from 'assert'

import sinon from 'sinon'

import { MessageLayer, Utils, Errors } from '../../../src'

const {
    StreamMessage, MessageID, GroupKeyRequest, GroupKeyResponse, GroupKeyAnnounce, GroupKeyErrorResponse, EncryptedGroupKey
} = MessageLayer
const { StreamMessageValidator, SigningUtil } = Utils
const { ValidationError } = Errors

describe('StreamMessageValidator', () => {
    let getStream
    let isPublisher
    let isSubscriber
    let verify
    let msg
    let msgWithNewGroupKey

    const publisherPrivateKey = 'd462a6f2ccd995a346a841d110e8c6954930a1c22851c0032d3116d8ccd2296a'
    const publisher = '0x6807295093ac5da6fb2a10f7dedc5edd620804fb'
    const subscriberPrivateKey = '81fe39ed83c4ab997f64564d0c5a630e34c621ad9bbe51ad2754fac575fc0c46'
    const subscriber = '0xbe0ab87a1f5b09afe9101b09e3c86fd8f4162527'

    let groupKeyRequest
    let groupKeyResponse
    let groupKeyAnnounce
    let groupKeyErrorResponse

    const defaultGetStreamResponse = {
        partitions: 10,
        requireSignedData: true,
        requireEncryptedData: false,
    }

    const getValidator = () => new StreamMessageValidator({
        getStream, isPublisher, isSubscriber, verify,
    })

    /* eslint-disable */
    const sign = async (msgToSign, privateKey) => {
        msgToSign.signatureType = StreamMessage.SIGNATURE_TYPES.ETH
        msgToSign.signature = await SigningUtil.sign(msgToSign.getPayloadToSign(), privateKey)
    }
    /* eslint-enable */

    beforeEach(async () => {
        // Default stubs
        getStream = sinon.stub().resolves(defaultGetStreamResponse)
        isPublisher = async (address, streamId) => {
            return address === publisher && streamId === 'streamId'
        }
        isSubscriber = async (address, streamId) => {
            return address === subscriber && streamId === 'streamId'
        }
        verify = undefined // use default impl by default

        msg = new StreamMessage({
            messageId: new MessageID('streamId', 0, 0, 0, publisher, 'msgChainId'),
            content: '{}',
        })
        await sign(msg, publisherPrivateKey)

        msgWithNewGroupKey = new StreamMessage({
            messageId: new MessageID('streamId', 0, 0, 0, publisher, 'msgChainId'),
            content: '{}',
            newGroupKey: new EncryptedGroupKey('groupKeyId', 'encryptedGroupKeyHex')
        })
        await sign(msgWithNewGroupKey, publisherPrivateKey)
        assert.notStrictEqual(msg.signature, msgWithNewGroupKey.signature)

        groupKeyRequest = new GroupKeyRequest({
            requestId: 'requestId',
            streamId: 'streamId',
            rsaPublicKey: 'rsaPublicKey',
            groupKeyIds: ['groupKeyId1', 'groupKeyId2'],
        }).toStreamMessage(
            new MessageID(`SYSTEM/keyexchange/${publisher.toLowerCase()}`, 0, 0, 0, subscriber, 'msgChainId'), null,
        )
        await sign(groupKeyRequest, subscriberPrivateKey)

        groupKeyResponse = new GroupKeyResponse({
            requestId: 'requestId',
            streamId: 'streamId',
            encryptedGroupKeys: [
                new EncryptedGroupKey('groupKeyId1', 'encryptedKey1'),
                new EncryptedGroupKey('groupKeyId2', 'encryptedKey2')
            ],
        }).toStreamMessage(
            new MessageID(`SYSTEM/keyexchange/${subscriber.toLowerCase()}`, 0, 0, 0, publisher, 'msgChainId'), null,
        )
        await sign(groupKeyResponse, publisherPrivateKey)

        groupKeyAnnounce = new GroupKeyAnnounce({
            streamId: 'streamId',
            encryptedGroupKeys: [
                new EncryptedGroupKey('groupKeyId1', 'encryptedKey1'),
                new EncryptedGroupKey('groupKeyId2', 'encryptedKey2')
            ],
        }).toStreamMessage(
            new MessageID(`SYSTEM/keyexchange/${subscriber.toLowerCase()}`, 0, 0, 0, publisher, 'msgChainId'), null,
        )
        await sign(groupKeyAnnounce, publisherPrivateKey)

        groupKeyErrorResponse = new GroupKeyErrorResponse({
            requestId: 'requestId',
            streamId: 'streamId',
            errorCode: 'errorCode',
            errorMessage: 'errorMessage',
            groupKeyIds: ['groupKeyId1', 'groupKeyId2'],
        }).toStreamMessage(
            new MessageID(`SYSTEM/keyexchange/${subscriber.toLowerCase()}`, 0, 0, 0, publisher, 'msgChainId'), null,
        )
        await sign(groupKeyErrorResponse, publisherPrivateKey)
    })

    describe('validate(unknown message type)', () => {
        it('throws on unknown message type', async () => {
            msg.messageType = 666
            await assert.rejects(getValidator().validate(msg), (err) => {
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

        it('accepts unsigned messages that dont need to be signed', async () => {
            getStream = sinon.stub().resolves({
                ...defaultGetStreamResponse,
                requireSignedData: false,
            })

            msg.signature = null
            msg.signatureType = StreamMessage.SIGNATURE_TYPES.NONE

            await getValidator().validate(msg)
        })

        it('rejects unsigned messages that should be signed', async () => {
            msg.signature = null
            msg.signatureType = StreamMessage.SIGNATURE_TYPES.NONE

            await assert.rejects(getValidator().validate(msg), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                assert(getStream.calledOnce, 'getStream not called once!')
                assert(getStream.calledWith(msg.getStreamId()), `getStream called with wrong args: ${getStream.getCall(0).args}`)
                return true
            })
        })

        it('accepts valid encrypted messages', async () => {
            getStream = sinon.stub().resolves({
                ...defaultGetStreamResponse,
                requireEncryptedData: true,
            })
            msg.encryptionType = StreamMessage.ENCRYPTION_TYPES.AES
            await getValidator().validate(msg)
        })

        it('rejects unencrypted messages if encryption is required', async () => {
            getStream = sinon.stub().resolves({
                ...defaultGetStreamResponse,
                requireEncryptedData: true,
            })
            msg.encryptionType = StreamMessage.ENCRYPTION_TYPES.NONE

            await assert.rejects(getValidator().validate(msg), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                assert(getStream.calledOnce, 'getStream not called once!')
                assert(getStream.calledWith(msg.getStreamId()), `getStream called with wrong args: ${getStream.getCall(0).args}`)
                return true
            })
        })

        it('rejects invalid signatures', async () => {
            msg.signature = msg.signature.replace('a', 'b')

            await assert.rejects(getValidator().validate(msg), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                return true
            })
        })

        it('rejects tampered content', async () => {
            msg.serializedContent = '{"attack":true}'

            await assert.rejects(getValidator().validate(msg), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                return true
            })
        })

        it('rejects tampered newGroupKey', async () => {
            msgWithNewGroupKey.newGroupKey.groupKeyId = 'foo'

            await assert.rejects(getValidator().validate(msgWithNewGroupKey), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                return true
            })
        })

        it('rejects messages from unpermitted publishers', async () => {
            isPublisher = sinon.stub().resolves(false)

            await assert.rejects(getValidator().validate(msg), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                assert(isPublisher.calledOnce, 'isPublisher not called!')
                assert(isPublisher.calledWith(msg.getPublisherId(), msg.getStreamId()), `isPublisher called with wrong args: ${isPublisher.getCall(0).args}`)
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
            getStream = sinon.stub().rejects(testError)

            await assert.rejects(getValidator().validate(msg), (err) => {
                assert(err === testError)
                return true
            })
        })

        it('rejects if isPublisher rejects', async () => {
            const testError = new Error('test error')
            isPublisher = sinon.stub().rejects(testError)
            await assert.rejects(getValidator().validate(msg), (err) => {
                assert(err === testError)
                return true
            })
        })

        it('rejects with ValidationError if verify throws', async () => {
            const testError = new Error('test error')
            verify = sinon.stub().throws(testError)
            await assert.rejects(getValidator().validate(msg), (err) => {
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

            await assert.rejects(getValidator().validate(groupKeyRequest), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                return true
            })
        })

        it('rejects group key requests on unexpected streams', async () => {
            groupKeyRequest.getStreamId = sinon.stub().returns('foo')

            await assert.rejects(getValidator().validate(groupKeyRequest), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                return true
            })
        })

        it('rejects invalid signatures', async () => {
            groupKeyRequest.signature = groupKeyRequest.signature.replace('a', 'b')

            await assert.rejects(getValidator().validate(groupKeyRequest), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                return true
            })
        })

        it('rejects messages to invalid publishers', async () => {
            isPublisher = sinon.stub().resolves(false)

            await assert.rejects(getValidator().validate(groupKeyRequest), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                assert(isPublisher.calledOnce, 'isPublisher not called!')
                assert(isPublisher.calledWith(publisher, 'streamId'), `isPublisher called with wrong args: ${isPublisher.getCall(0).args}`)
                return true
            })
        })

        it('rejects messages from unpermitted subscribers', async () => {
            isSubscriber = sinon.stub().resolves(false)

            await assert.rejects(getValidator().validate(groupKeyRequest), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                assert(isSubscriber.calledOnce, 'isSubscriber not called!')
                assert(isSubscriber.calledWith(subscriber, 'streamId'), `isPublisher called with wrong args: ${isSubscriber.getCall(0).args}`)
                return true
            })
        })

        it('rejects if isPublisher rejects', async () => {
            const testError = new Error('test error')
            isPublisher = sinon.stub().rejects(testError)
            await assert.rejects(getValidator().validate(groupKeyRequest), (err) => {
                assert(err === testError)
                return true
            })
        })

        it('rejects if isSubscriber rejects', async () => {
            const testError = new Error('test error')
            isSubscriber = sinon.stub().rejects(testError)
            await assert.rejects(getValidator().validate(groupKeyRequest), (err) => {
                assert(err === testError)
                return true
            })
        })

        it('rejects with ValidationError if verify throws', async () => {
            const testError = new Error('test error')
            verify = sinon.stub().throws(testError)
            await assert.rejects(getValidator().validate(groupKeyRequest), (err) => {
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

            await assert.rejects(getValidator().validate(groupKeyResponse), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                return true
            })
        })

        it('rejects invalid signatures', async () => {
            groupKeyResponse.signature = groupKeyResponse.signature.replace('a', 'b')

            await assert.rejects(getValidator().validate(groupKeyResponse), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                return true
            })
        })

        it('rejects group key responses on unexpected streams', async () => {
            groupKeyResponse.getStreamId = sinon.stub().returns('foo')

            await assert.rejects(getValidator().validate(groupKeyResponse), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                return true
            })
        })

        it('rejects messages from invalid publishers', async () => {
            isPublisher = sinon.stub().resolves(false)

            await assert.rejects(getValidator().validate(groupKeyResponse), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                assert(isPublisher.calledOnce, 'isPublisher not called!')
                assert(isPublisher.calledWith(publisher, 'streamId'), `isPublisher called with wrong args: ${isPublisher.getCall(0).args}`)
                return true
            })
        })

        it('rejects messages to unpermitted subscribers', async () => {
            isSubscriber = sinon.stub().resolves(false)

            await assert.rejects(getValidator().validate(groupKeyResponse), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                assert(isSubscriber.calledOnce, 'isSubscriber not called!')
                assert(isSubscriber.calledWith(subscriber, 'streamId'), `isSubscriber called with wrong args: ${isSubscriber.getCall(0).args}`)
                return true
            })
        })

        it('rejects if isPublisher rejects', async () => {
            const testError = new Error('test error')
            isPublisher = sinon.stub().rejects(testError)
            await assert.rejects(getValidator().validate(groupKeyResponse), (err) => {
                assert(err === testError)
                return true
            })
        })

        it('rejects if isSubscriber rejects', async () => {
            const testError = new Error('test error')
            isSubscriber = sinon.stub().rejects(testError)
            await assert.rejects(getValidator().validate(groupKeyResponse), (err) => {
                assert(err === testError)
                return true
            })
        })

        it('rejects with ValidationError if verify throws', async () => {
            const testError = new Error('test error')
            verify = sinon.stub().throws(testError)
            await assert.rejects(getValidator().validate(groupKeyResponse), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                return true
            })
        })
    })

    describe('validate(group key announce)', () => {
        it('accepts valid group key announces', async () => {
            await getValidator().validate(groupKeyAnnounce)
        })

        it('rejects unsigned group key announces', async () => {
            groupKeyAnnounce.signature = null
            groupKeyAnnounce.signatureType = StreamMessage.SIGNATURE_TYPES.NONE

            await assert.rejects(getValidator().validate(groupKeyAnnounce), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                return true
            })
        })

        it('rejects invalid signatures', async () => {
            groupKeyAnnounce.signature = groupKeyAnnounce.signature.replace('a', 'b')

            await assert.rejects(getValidator().validate(groupKeyAnnounce), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                return true
            })
        })

        it('rejects messages from invalid publishers', async () => {
            isPublisher = sinon.stub().resolves(false)

            await assert.rejects(getValidator().validate(groupKeyAnnounce), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                assert(isPublisher.calledOnce, 'isPublisher not called!')
                assert(isPublisher.calledWith(publisher, 'streamId'), `isPublisher called with wrong args: ${isPublisher.getCall(0).args}`)
                return true
            })
        })

        it('rejects messages to unpermitted subscribers', async () => {
            isSubscriber = sinon.stub().resolves(false)

            await assert.rejects(getValidator().validate(groupKeyAnnounce), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                assert(isSubscriber.calledOnce, 'isSubscriber not called!')
                assert(isSubscriber.calledWith(subscriber, 'streamId'), `isSubscriber called with wrong args: ${isSubscriber.getCall(0).args}`)
                return true
            })
        })

        it('rejects if isPublisher rejects', async () => {
            const testError = new Error('test error')
            isPublisher = sinon.stub().rejects(testError)
            await assert.rejects(getValidator().validate(groupKeyAnnounce), (err) => {
                assert(err === testError)
                return true
            })
        })

        it('rejects if isSubscriber rejects', async () => {
            const testError = new Error('test error')
            isSubscriber = sinon.stub().rejects(testError)
            await assert.rejects(getValidator().validate(groupKeyAnnounce), (err) => {
                assert(err === testError, `Unexpected error thrown: ${err}`)
                return true
            })
        })

        it('rejects with ValidationError if verify throws', async () => {
            const testError = new Error('test error')
            verify = sinon.stub().throws(testError)
            await assert.rejects(getValidator().validate(groupKeyAnnounce), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                return true
            })
        })
    })

    describe('validate(group key error response)', () => {
        it('accepts valid group key error responses', async () => {
            await getValidator().validate(groupKeyErrorResponse)
        })

        it('rejects unsigned group key error responses', async () => {
            groupKeyErrorResponse.signature = null
            groupKeyErrorResponse.signatureType = StreamMessage.SIGNATURE_TYPES.NONE

            await assert.rejects(getValidator().validate(groupKeyErrorResponse), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                return true
            })
        })

        it('rejects invalid signatures', async () => {
            groupKeyErrorResponse.signature = groupKeyErrorResponse.signature.replace('a', 'b')

            await assert.rejects(getValidator().validate(groupKeyErrorResponse), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                return true
            })
        })

        it('rejects group key error responses on unexpected streams', async () => {
            groupKeyErrorResponse.getStreamId = sinon.stub().returns('foo')

            await assert.rejects(getValidator().validate(groupKeyErrorResponse), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                return true
            })
        })

        it('rejects messages from invalid publishers', async () => {
            isPublisher = sinon.stub().resolves(false)

            await assert.rejects(getValidator().validate(groupKeyErrorResponse), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                assert(isPublisher.calledOnce, 'isPublisher not called!')
                assert(isPublisher.calledWith(publisher, 'streamId'), `isPublisher called with wrong args: ${isPublisher.getCall(0).args}`)
                return true
            })
        })

        it('rejects messages to unpermitted subscribers', async () => {
            isSubscriber = sinon.stub().resolves(false)

            await assert.rejects(getValidator().validate(groupKeyErrorResponse), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                assert(isSubscriber.calledOnce, 'isSubscriber not called!')
                assert(isSubscriber.calledWith(subscriber, 'streamId'), `isSubscriber called with wrong args: ${isSubscriber.getCall(0).args}`)
                return true
            })
        })

        it('rejects if isPublisher rejects', async () => {
            const testError = new Error('test error')
            isPublisher = sinon.stub().rejects(testError)
            await assert.rejects(getValidator().validate(groupKeyErrorResponse), (err) => {
                assert(err === testError)
                return true
            })
        })

        it('rejects if isSubscriber rejects', async () => {
            const testError = new Error('test error')
            isSubscriber = sinon.stub().rejects(testError)
            await assert.rejects(getValidator().validate(groupKeyErrorResponse), (err) => {
                assert(err === testError)
                return true
            })
        })

        it('rejects with ValidationError if verify throws', async () => {
            const testError = new Error('test error')
            verify = sinon.stub().throws(testError)
            await assert.rejects(getValidator().validate(groupKeyErrorResponse), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                return true
            })
        })
    })

    describe('isKeyExchangeStream', () => {
        it('returns true for streams that start with the correct prefix', () => {
            assert(StreamMessageValidator.isKeyExchangeStream('SYSTEM/keyexchange/0x1234'))
            assert(StreamMessageValidator.isKeyExchangeStream('SYSTEM/keyexchange/foo'))
        })
        it('returns false for other streams', () => {
            assert(!StreamMessageValidator.isKeyExchangeStream('SYSTEM/keyexchangefoo'))
        })
    })
})

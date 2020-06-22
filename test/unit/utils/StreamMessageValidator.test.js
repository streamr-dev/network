import assert from 'assert'

import sinon from 'sinon'

import StreamMessageValidator from '../../../src/utils/StreamMessageValidator'
import StreamMessage from '../../../src/protocol/message_layer/StreamMessage'
// eslint-disable-next-line no-unused-vars
import StreamMessageSerializerV31 from '../../../src/protocol/message_layer/StreamMessageSerializerV31'
import ValidationError from '../../../src/errors/ValidationError'

describe('StreamMessageValidator', () => {
    let getStream
    let isPublisher
    let isSubscriber
    let verify
    let msg

    // publisher private key: d462a6f2ccd995a346a841d110e8c6954930a1c22851c0032d3116d8ccd2296a
    const publisher = '0x6807295093ac5da6fb2a10f7dedc5edd620804fb'
    // subscriber private key: 81fe39ed83c4ab997f64564d0c5a630e34c621ad9bbe51ad2754fac575fc0c46
    const subscriber = '0xbe0ab87a1f5b09afe9101b09e3c86fd8f4162527'

    let groupKeyRequest
    let groupKeyResponse
    let groupKeyReset
    let groupKeyErrorResponse

    const defaultGetStreamResponse = {
        partitions: 10,
        requireSignedData: true,
        requireEncryptedData: false,
    }

    const getValidator = () => new StreamMessageValidator({
        getStream, isPublisher, isSubscriber, verify,
    })

    beforeEach(() => {
        // Default stubs
        getStream = sinon.stub().resolves(defaultGetStreamResponse)
        isPublisher = sinon.stub().resolves(true)
        isSubscriber = sinon.stub().resolves(true)
        verify = undefined // use default impl by default

        msg = StreamMessage.deserialize('[31,["tagHE6nTQ9SJV2wPoCxBFw",0,1587141844396,0,"0x6807295093ac5da6fb2a10f7dedc5edd620804fb","k000EDTMtqOTLM8sirFj"],[1587141844312,0],27,0,"{\\"eventType\\":\\"trade\\",\\"eventTime\\":1587141844398,\\"symbol\\":\\"ETHBTC\\",\\"tradeId\\":172530352,\\"price\\":0.02415,\\"quantity\\":0.296,\\"buyerOrderId\\":687544144,\\"sellerOrderId\\":687544104,\\"time\\":1587141844396,\\"maker\\":false,\\"ignored\\":true}",2,"0x6ad42041804c34902aaf7f07780b3e468ec2faec84eda2ff504d5fc26377d5556481d133d7f3f112c63cd48ee9081172013fb0ae1a61b45ee9ca89e057b099591b"]')
        groupKeyRequest = StreamMessage.deserialize('[31,["SYSTEM/keyexchange/0x6807295093ac5da6fb2a10f7dedc5edd620804fb",0,1587143350864,0,"0xbe0ab87a1f5b09afe9101b09e3c86fd8f4162527","2AC1lJgGTPhVzNCr4lyT"],null,28,0,"{\\"requestId\\":\\"groupKeyRequestId\\",\\"streamId\\":\\"tagHE6nTQ9SJV2wPoCxBFw\\",\\"publicKey\\":\\"rsaPublicKey\\",\\"range\\":{\\"start\\":1354155,\\"end\\":2344155}}",2,"0xa442e08c54257f3245abeb9a64c9381b2459029c6f9d88ff3b4839e67843519736b5f469b3d36a5d659f7eb47fb5c4af165445aa176ad01e6134e0901e0f5fd01c"]')
        groupKeyResponse = StreamMessage.deserialize('[31,["SYSTEM/keyexchange/0xbe0ab87a1f5b09afe9101b09e3c86fd8f4162527",0,1587143432683,0,"0x6807295093ac5da6fb2a10f7dedc5edd620804fb","2hmxXpkhmaLcJipCDVDm"],null,29,1,"{\\"requestId\\":\\"groupKeyRequestId\\",\\"streamId\\":\\"tagHE6nTQ9SJV2wPoCxBFw\\",\\"keys\\":[{\\"groupKey\\":\\"encrypted-group-key\\",\\"start\\":34524}]}",2,"0xe633ef60a4ad8c80e6d58010614e08376912711261d9136b3debf4c5a602b8e27e7235d58667c470791373e9fa2757575d02f539cf9556a6724661ef28c055871c"]')
        groupKeyReset = StreamMessage.deserialize('[31,["SYSTEM/keyexchange/0xbe0ab87a1f5b09afe9101b09e3c86fd8f4162527",0,1587143432683,0,"0x6807295093ac5da6fb2a10f7dedc5edd620804fb","2hmxXpkhmaLcJipCDVDm"],null,30,1,"{\\"streamId\\":\\"tagHE6nTQ9SJV2wPoCxBFw\\",\\"groupKey\\":\\"encrypted-group-key\\",\\"start\\":34524}",2,"0xfcc1b55818ed8949e3d94e423c320ae6fdc732f6956cabec87b0e8e1674a29de0f483aeed14914496ea572d81cfd5eaf232a7d1ccb3cb8b0c0ed9cc6874b880b1b"]')
        groupKeyErrorResponse = StreamMessage.deserialize('[31,["SYSTEM/keyexchange/0xbe0ab87a1f5b09afe9101b09e3c86fd8f4162527",0,1587143432683,0,"0x6807295093ac5da6fb2a10f7dedc5edd620804fb","2hmxXpkhmaLcJipCDVDm"],null,31,1,"{\\"requestId\\":\\"groupKeyRequestId\\",\\"streamId\\":\\"tagHE6nTQ9SJV2wPoCxBFw\\",\\"code\\":\\"TEST_ERROR\\",\\"message\\":\\"Test error message\\"}",2,"0x74301e65c0cb8f553b7aa2e0eeac61aaff918726f6f7699bd05e9201e591cf0c304b5812c28dd2903b394c57dde1c23dae787ec0005d6e2bc1c03edeb7cdbfc41c"]')
    })

    describe('validate(unknown content type)', () => {
        it('throws on unknown content type', async () => {
            msg.contentType = 666
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
                assert(isPublisher.calledWith(publisher, groupKeyRequest.getParsedContent().streamId), `isPublisher called with wrong args: ${isPublisher.getCall(0).args}`)
                return true
            })
        })

        it('rejects messages from unpermitted subscribers', async () => {
            isSubscriber = sinon.stub().resolves(false)

            await assert.rejects(getValidator().validate(groupKeyRequest), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                assert(isSubscriber.calledOnce, 'isSubscriber not called!')
                assert(isSubscriber.calledWith(subscriber, groupKeyRequest.getParsedContent().streamId), `isPublisher called with wrong args: ${isPublisher.getCall(0).args}`)
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
                assert(isPublisher.calledWith(publisher, groupKeyResponse.getParsedContent().streamId), `isPublisher called with wrong args: ${isPublisher.getCall(0).args}`)
                return true
            })
        })

        it('rejects messages to unpermitted subscribers', async () => {
            isSubscriber = sinon.stub().resolves(false)

            await assert.rejects(getValidator().validate(groupKeyResponse), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                assert(isSubscriber.calledOnce, 'isSubscriber not called!')
                assert(isSubscriber.calledWith(subscriber, groupKeyResponse.getParsedContent().streamId), `isSubscriber called with wrong args: ${isSubscriber.getCall(0).args}`)
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

    describe('validate(group key reset)', () => {
        it('accepts valid group key resets', async () => {
            await getValidator().validate(groupKeyReset)
        })

        it('rejects unsigned group key resets', async () => {
            groupKeyReset.signature = null
            groupKeyReset.signatureType = StreamMessage.SIGNATURE_TYPES.NONE

            await assert.rejects(getValidator().validate(groupKeyReset), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                return true
            })
        })

        it('rejects invalid signatures', async () => {
            groupKeyReset.signature = groupKeyReset.signature.replace('a', 'b')

            await assert.rejects(getValidator().validate(groupKeyReset), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                return true
            })
        })

        it('rejects group key resets on unexpected streams', async () => {
            groupKeyReset.getStreamId = sinon.stub().returns('foo')

            await assert.rejects(getValidator().validate(groupKeyReset), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                return true
            })
        })

        it('rejects messages from invalid publishers', async () => {
            isPublisher = sinon.stub().resolves(false)

            await assert.rejects(getValidator().validate(groupKeyReset), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                assert(isPublisher.calledOnce, 'isPublisher not called!')
                assert(isPublisher.calledWith(publisher, groupKeyReset.getParsedContent().streamId), `isPublisher called with wrong args: ${isPublisher.getCall(0).args}`)
                return true
            })
        })

        it('rejects messages to unpermitted subscribers', async () => {
            isSubscriber = sinon.stub().resolves(false)

            await assert.rejects(getValidator().validate(groupKeyReset), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                assert(isSubscriber.calledOnce, 'isSubscriber not called!')
                assert(isSubscriber.calledWith(subscriber, groupKeyReset.getParsedContent().streamId), `isSubscriber called with wrong args: ${isSubscriber.getCall(0).args}`)
                return true
            })
        })

        it('rejects if isPublisher rejects', async () => {
            const testError = new Error('test error')
            isPublisher = sinon.stub().rejects(testError)
            await assert.rejects(getValidator().validate(groupKeyReset), (err) => {
                assert(err === testError)
                return true
            })
        })

        it('rejects if isSubscriber rejects', async () => {
            const testError = new Error('test error')
            isSubscriber = sinon.stub().rejects(testError)
            await assert.rejects(getValidator().validate(groupKeyReset), (err) => {
                assert(err === testError)
                return true
            })
        })

        it('rejects with ValidationError if verify throws', async () => {
            const testError = new Error('test error')
            verify = sinon.stub().throws(testError)
            await assert.rejects(getValidator().validate(groupKeyReset), (err) => {
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
                assert(isPublisher.calledWith(publisher, groupKeyErrorResponse.getParsedContent().streamId), `isPublisher called with wrong args: ${isPublisher.getCall(0).args}`)
                return true
            })
        })

        it('rejects messages to unpermitted subscribers', async () => {
            isSubscriber = sinon.stub().resolves(false)

            await assert.rejects(getValidator().validate(groupKeyErrorResponse), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                assert(isSubscriber.calledOnce, 'isSubscriber not called!')
                assert(isSubscriber.calledWith(subscriber, groupKeyErrorResponse.getParsedContent().streamId), `isSubscriber called with wrong args: ${isSubscriber.getCall(0).args}`)
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

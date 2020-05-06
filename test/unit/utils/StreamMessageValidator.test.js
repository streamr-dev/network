import assert from 'assert'

import sinon from 'sinon'
import { ethers } from 'ethers'

import StreamMessageValidator from '../../../src/utils/StreamMessageValidator'
import StreamMessage from '../../../src/protocol/message_layer/StreamMessage'
// eslint-disable-next-line no-unused-vars
import StreamMessageV31 from '../../../src/protocol/message_layer/StreamMessageV31' // Imported because it sets StreamMessage.latestClass
import StreamMessageFactory from '../../../src/protocol/message_layer/StreamMessageFactory'
import ValidationError from '../../../src/errors/ValidationError'

describe('StreamMessageValidator', () => {
    let getStream
    let isPublisher
    let isSubscriber
    let recoverAddress
    let msg
    let groupKeyRequest
    let groupKeyResponse
    let groupKeyReset

    const defaultGetStreamResponse = {
        partitions: 10,
        requireSignedData: true,
        requireEncryptedData: false,
    }

    const getValidator = () => new StreamMessageValidator({
        getStream, isPublisher, isSubscriber, recoverAddress,
    })

    beforeEach(() => {
        // Default stubs
        getStream = sinon.stub().resolves(defaultGetStreamResponse)
        isPublisher = sinon.stub().resolves(true)
        isSubscriber = sinon.stub().resolves(true)
        recoverAddress = (payload, signature) => ethers.utils.verifyMessage(payload, signature)

        msg = StreamMessageFactory.deserialize('[31,["tagHE6nTQ9SJV2wPoCxBFw",0,1587141844396,0,"0xbce3217F2AC9c8a2D14A6303F87506c4FC124014","k000EDTMtqOTLM8sirFj"],[1587141844312,0],27,0,"{\\"eventType\\":\\"trade\\",\\"eventTime\\":1587141844398,\\"symbol\\":\\"ETHBTC\\",\\"tradeId\\":172530352,\\"price\\":0.02415,\\"quantity\\":0.296,\\"buyerOrderId\\":687544144,\\"sellerOrderId\\":687544104,\\"time\\":1587141844396,\\"maker\\":false,\\"ignored\\":true}",2,"0x91c47df28dc3014a49ef50313efa8e40015eeeccea0cf006ab2c7b05efbb0ddc7e10e430aaa7ea6dd0ca5e05761eaf0c14c8ca09b57c8d8626da7bb9ea2d50fa1b"]')
        groupKeyRequest = StreamMessageFactory.deserialize('[31,["SYSTEM/keyexchange/0xbce3217F2AC9c8a2D14A6303F87506c4FC124014",0,1587143350864,0,"0xFeAACDBBc318EbBF9BB5835D4173C1a7fC24B3b9","2AC1lJgGTPhVzNCr4lyT"],null,28,0,"{\\"streamId\\":\\"tagHE6nTQ9SJV2wPoCxBFw\\",\\"publicKey\\":\\"rsaPublicKey\\",\\"range\\":{\\"start\\":1354155,\\"end\\":2344155}}",2,"0x968292d5a57529042543318c60f20a709d838e37f166ea478e4695750bacf51446dd12aa1c652f97ba300b244fab988592748c27d590de5ff0e2f1c71d0455c41b"]')
        groupKeyResponse = StreamMessageFactory.deserialize('[31,["SYSTEM/keyexchange/0xbce3217F2AC9c8a2D14A6303F87506c4FC124014",0,1587143432683,0,"0xFeAACDBBc318EbBF9BB5835D4173C1a7fC24B3b9","2hmxXpkhmaLcJipCDVDm"],null,29,1,"{\\"streamId\\":\\"tagHE6nTQ9SJV2wPoCxBFw\\",\\"keys\\":[{\\"groupKey\\":\\"encrypted-group-key\\",\\"start\\":34524}]}",2,"0xab2ecce6ee5cfb0890cbb4f9f4d5daf9fd8283eb53bdf67144d920624e22424657f96c3c2a3cafe53ca2049e235be5d08f6181546152c3e61cf509db2fd0e6701c"]')
        groupKeyReset = StreamMessageFactory.deserialize('[31,["SYSTEM/keyexchange/0xbce3217F2AC9c8a2D14A6303F87506c4FC124014",0,1587143432683,0,"0xFeAACDBBc318EbBF9BB5835D4173C1a7fC24B3b9","2hmxXpkhmaLcJipCDVDm"],null,30,1,"{\\"streamId\\":\\"tagHE6nTQ9SJV2wPoCxBFw\\",\\"groupKey\\":\\"encrypted-group-key\\",\\"start\\":34524}",2,"0xefa15b14db0f57c8c6d14fd8428d8de195db691598a53000dc2993808563edef49118cb666581b260f0fe70874f52553b2851dcb19b5f19333136191211cff2b1b"]')
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

        it('rejects with ValidationError if recoverAddress throws', async () => {
            const testError = new Error('test error')
            recoverAddress = sinon.stub().throws(testError)
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
                assert(isPublisher.calledWith('0xbce3217F2AC9c8a2D14A6303F87506c4FC124014', 'tagHE6nTQ9SJV2wPoCxBFw'), `isPublisher called with wrong args: ${isPublisher.getCall(0).args}`)
                return true
            })
        })

        it('rejects messages from unpermitted subscribers', async () => {
            isSubscriber = sinon.stub().resolves(false)

            await assert.rejects(getValidator().validate(groupKeyRequest), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                assert(isSubscriber.calledOnce, 'isSubscriber not called!')
                assert(isSubscriber.calledWith('0xFeAACDBBc318EbBF9BB5835D4173C1a7fC24B3b9', 'tagHE6nTQ9SJV2wPoCxBFw'), `isPublisher called with wrong args: ${isPublisher.getCall(0).args}`)
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

        it('rejects with ValidationError if recoverAddress throws', async () => {
            const testError = new Error('test error')
            recoverAddress = sinon.stub().throws(testError)
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
                assert(isPublisher.calledWith('0xFeAACDBBc318EbBF9BB5835D4173C1a7fC24B3b9', 'tagHE6nTQ9SJV2wPoCxBFw'), `isPublisher called with wrong args: ${isPublisher.getCall(0).args}`)
                return true
            })
        })

        it('rejects messages to unpermitted subscribers', async () => {
            isSubscriber = sinon.stub().resolves(false)

            await assert.rejects(getValidator().validate(groupKeyResponse), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                assert(isSubscriber.calledOnce, 'isSubscriber not called!')
                assert(isSubscriber.calledWith('0xbce3217F2AC9c8a2D14A6303F87506c4FC124014', 'tagHE6nTQ9SJV2wPoCxBFw'), `isSubscriber called with wrong args: ${isSubscriber.getCall(0).args}`)
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

        it('rejects with ValidationError if recoverAddress throws', async () => {
            const testError = new Error('test error')
            recoverAddress = sinon.stub().throws(testError)
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
                assert(isPublisher.calledWith('0xFeAACDBBc318EbBF9BB5835D4173C1a7fC24B3b9', 'tagHE6nTQ9SJV2wPoCxBFw'), `isPublisher called with wrong args: ${isPublisher.getCall(0).args}`)
                return true
            })
        })

        it('rejects messages to unpermitted subscribers', async () => {
            isSubscriber = sinon.stub().resolves(false)

            await assert.rejects(getValidator().validate(groupKeyReset), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                assert(isSubscriber.calledOnce, 'isSubscriber not called!')
                assert(isSubscriber.calledWith('0xbce3217F2AC9c8a2D14A6303F87506c4FC124014', 'tagHE6nTQ9SJV2wPoCxBFw'), `isSubscriber called with wrong args: ${isSubscriber.getCall(0).args}`)
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

        it('rejects with ValidationError if recoverAddress throws', async () => {
            const testError = new Error('test error')
            recoverAddress = sinon.stub().throws(testError)
            await assert.rejects(getValidator().validate(groupKeyReset), (err) => {
                assert(err instanceof ValidationError, `Unexpected error thrown: ${err}`)
                return true
            })
        })
    })
})

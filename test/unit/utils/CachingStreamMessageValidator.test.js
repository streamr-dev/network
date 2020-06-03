import assert from 'assert'

import sinon from 'sinon'
import sleep from 'await-sleep'

import CachingStreamMessageValidator from '../../../src/utils/CachingStreamMessageValidator'
import StreamMessage from '../../../src/protocol/message_layer/StreamMessage'
import StreamMessageSerializerV31 from '../../../src/protocol/message_layer/StreamMessageSerializerV31' // eslint-disable-line no-unused-vars

describe('CachingStreamMessageValidator', () => {
    let cacheTimeoutMillis
    let cacheErrorsTimeoutMillis
    let getStream
    let isPublisher
    let isSubscriber
    let verify
    let streamMetadata
    let msg

    const getValidator = () => new CachingStreamMessageValidator({
        getStream,
        isPublisher,
        isSubscriber,
        verify,
        cacheTimeoutMillis,
        cacheErrorsTimeoutMillis,
    })

    beforeEach(() => {
        streamMetadata = {
            partitions: 10,
            requireSignedData: true,
            requireEncryptedData: false,
        }

        // Default stubs
        getStream = sinon.stub().resolves(streamMetadata)
        isPublisher = sinon.stub().resolves(true)
        isSubscriber = sinon.stub().resolves(true)
        verify = sinon.stub().resolves(true)
        cacheTimeoutMillis = 15 * 60 * 1000

        msg = StreamMessage.deserialize('[31,["tagHE6nTQ9SJV2wPoCxBFw",0,1587141844396,0,"0xbce3217F2AC9c8a2D14A6303F87506c4FC124014","k000EDTMtqOTLM8sirFj"],[1587141844312,0],27,0,"{\\"eventType\\":\\"trade\\",\\"eventTime\\":1587141844398,\\"symbol\\":\\"ETHBTC\\",\\"tradeId\\":172530352,\\"price\\":0.02415,\\"quantity\\":0.296,\\"buyerOrderId\\":687544144,\\"sellerOrderId\\":687544104,\\"time\\":1587141844396,\\"maker\\":false,\\"ignored\\":true}",2,"0x91c47df28dc3014a49ef50313efa8e40015eeeccea0cf006ab2c7b05efbb0ddc7e10e430aaa7ea6dd0ca5e05761eaf0c14c8ca09b57c8d8626da7bb9ea2d50fa1b"]')
    })

    // Note: this test assumes that the passed getStream, isPublisher, and isSubscriber are cached in the same way.
    // Only validation of normal messages is tested, which uses only isPublisher.

    it('only calls the expensive function once (sequential promise resolution)', async () => {
        const validator = getValidator()
        await validator.validate(msg)
        await validator.validate(msg)
        assert.strictEqual(getStream.callCount, 1) // cached
        assert.strictEqual(isPublisher.callCount, 1) // cached
        assert.strictEqual(verify.callCount, 2) // not cached
    })

    it('only calls the expensive functions once (parallel promise resolution)', async () => {
        // Make sure the returned promise resolves asynchronously!
        // I think the sinon.stub().resolves() might return an already-resolved promise.
        getStream = sinon.spy(() => new Promise((resolve) => {
            setTimeout(() => resolve(streamMetadata), 0)
        }))
        isPublisher = sinon.spy(() => new Promise((resolve) => {
            setTimeout(() => resolve(true), 0)
        }))

        const validator = getValidator()

        // Starts both validate calls synchronously, but waits for them both to resolve before assertions
        await Promise.all([
            validator.validate(msg),
            validator.validate(msg),
        ])
        assert.strictEqual(getStream.callCount, 1)
        assert.strictEqual(isPublisher.callCount, 1)
    })

    it('only calls the expensive function once for each different stream', async () => {
        const msg2 = StreamMessage.deserialize('[31,["streamId",0,1587141844396,0,"0xbce3217F2AC9c8a2D14A6303F87506c4FC124014","k000EDTMtqOTLM8sirFj"],[1587141844312,0],27,0,"{\\"foo\\":\\"bar\\"}",2,"some-signature"]')
        const validator = getValidator()

        await validator.validate(msg)
        await validator.validate(msg2)

        assert.strictEqual(isPublisher.callCount, 2, `Unexpected calls: ${isPublisher.getCalls()}`)
        assert(isPublisher.calledWith('0xbce3217F2AC9c8a2D14A6303F87506c4FC124014', 'streamId'), `Unexpected calls: ${isPublisher.getCalls()}`)
        assert(isPublisher.calledWith('0xbce3217F2AC9c8a2D14A6303F87506c4FC124014', 'tagHE6nTQ9SJV2wPoCxBFw'), `Unexpected calls: ${isPublisher.getCalls()}`)
    })

    it('expires items from cache after timeout', async () => {
        // Tried sinon fake timers, but for some reason they didn't work. Going with wall-clock time for now.
        cacheTimeoutMillis = 1000
        const validator = getValidator()

        await validator.validate(msg)
        await validator.validate(msg)
        assert.strictEqual(isPublisher.callCount, 1)

        await sleep(cacheTimeoutMillis * 3)

        // Results should have been expired
        await validator.validate(msg)
        await validator.validate(msg)
        assert.strictEqual(isPublisher.callCount, 2)
    })

    it('does not swallow rejections', async () => {
        const testError = new Error('test error')
        isPublisher = sinon.stub().rejects(testError)
        await assert.rejects(getValidator().validate(msg), (err) => {
            assert(err === testError)
            return true
        })
    })

    it('caches errors and expires them with separate timeout', async () => {
        // Tried sinon fake timers, but for some reason they didn't work. Going with wall-clock time for now.
        cacheErrorsTimeoutMillis = 1000
        const testError = new Error('test error')
        isPublisher = sinon.stub().rejects(testError)

        const validator = getValidator()

        await assert.rejects(validator.validate(msg))
        await assert.rejects(validator.validate(msg))
        assert.strictEqual(isPublisher.callCount, 1)

        await sleep(cacheErrorsTimeoutMillis * 3)

        // Error results should have been expired
        await assert.rejects(validator.validate(msg))
        await assert.rejects(validator.validate(msg))
        assert.strictEqual(isPublisher.callCount, 2)
    })

    // Further tests would basically be just testing the memoizee library. Add more tests if the implementation grows.
})

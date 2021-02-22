import assert from 'assert'

import sinon from 'sinon'
import { wait } from 'streamr-test-utils'

import CachingStreamMessageValidator from '../../../src/utils/CachingStreamMessageValidator'
import StreamMessage from '../../../src/protocol/message_layer/StreamMessage'
import '../../../src/protocol/message_layer/StreamMessageSerializerV31'
import { StreamMetadata } from '../../../src/utils/StreamMessageValidator'

describe('CachingStreamMessageValidator', () => {
    let cacheTimeoutMillis: number
    let cacheErrorsTimeoutMillis: number
    let getStream: (streamId: string) => Promise<StreamMetadata>
    let isPublisher: (address: string, streamId: string) => Promise<boolean>
    let isSubscriber: (address: string, streamId: string) => Promise<boolean>
    let verify: ((address: string, payload: string, signature: string) => Promise<boolean>) | undefined
    let streamMetadata: StreamMetadata
    let msg: StreamMessage

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
        assert.strictEqual((getStream as any).callCount, 1) // cached
        assert.strictEqual((isPublisher as any).callCount, 1) // cached
        assert.strictEqual((verify as any).callCount, 2) // not cached
    })

    it('only calls the expensive functions once (parallel promise resolution)', async () => {
        // Make sure the returned promise resolves asynchronously!
        // I think the sinon.stub().resolves() might return an already-resolved promise.
        getStream = sinon.spy(() => new Promise((resolve) => {
            setTimeout(() => resolve(streamMetadata), 0)
        })) as any
        isPublisher = sinon.spy(() => new Promise((resolve) => {
            setTimeout(() => resolve(true), 0)
        })) as any

        const validator = getValidator()

        // Starts both validate calls synchronously, but waits for them both to resolve before assertions
        await Promise.all([
            validator.validate(msg),
            validator.validate(msg),
        ])
        assert.strictEqual((getStream as any).callCount, 1)
        assert.strictEqual((isPublisher as any).callCount, 1)
    })

    it('only calls the expensive function once for each different stream', async () => {
        const msg2 = StreamMessage.deserialize('[31,["streamId",0,1587141844396,0,"0xbce3217F2AC9c8a2D14A6303F87506c4FC124014","k000EDTMtqOTLM8sirFj"],[1587141844312,0],27,0,"{\\"foo\\":\\"bar\\"}",2,"some-signature"]')
        const validator = getValidator()

        await validator.validate(msg)
        await validator.validate(msg2)

        assert.strictEqual((isPublisher as any).callCount, 2, `Unexpected calls: ${(isPublisher as any).getCalls()}`)
        assert((isPublisher as any).calledWith('0xbce3217F2AC9c8a2D14A6303F87506c4FC124014', 'streamId'), `Unexpected calls: ${(isPublisher as any).getCalls()}`)
        assert((isPublisher as any).calledWith('0xbce3217F2AC9c8a2D14A6303F87506c4FC124014', 'tagHE6nTQ9SJV2wPoCxBFw'), `Unexpected calls: ${(isPublisher as any).getCalls()}`)
    })

    it('expires items from cache after timeout', async () => {
        // Tried sinon fake timers, but for some reason they didn't work. Going with wall-clock time for now.
        cacheTimeoutMillis = 1000
        const validator = getValidator()

        await validator.validate(msg)
        await validator.validate(msg)
        assert.strictEqual((isPublisher as any).callCount, 1)

        await wait(cacheTimeoutMillis * 3)

        // Results should have been expired
        await validator.validate(msg)
        await validator.validate(msg)
        assert.strictEqual((isPublisher as any).callCount, 2)
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
        assert.strictEqual((isPublisher as any).callCount, 1)

        await wait(cacheErrorsTimeoutMillis * 3)

        // Error results should have been expired
        await assert.rejects(validator.validate(msg))
        await assert.rejects(validator.validate(msg))
        assert.strictEqual((isPublisher as any).callCount, 2)
    })

    // Further tests would basically be just testing the memoizee library. Add more tests if the implementation grows.
})

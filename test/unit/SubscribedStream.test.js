import assert from 'assert'
import sinon from 'sinon'
import { MessageLayer } from 'streamr-client-protocol'
import SubscribedStream from '../../src/SubscribedStream'
import Signer from '../../src/Signer'

const { StreamMessage } = MessageLayer

describe('SubscribedStream', () => {
    let subscribedStream
    const publishers = ['0xb8CE9ab6943e0eCED004cDe8e3bBed6568B2Fa01'.toLowerCase(), 'publisher2', 'publisher3']

    function setupClientAndStream(verifySignatures = 'auto', requireSignedData = true) {
        const client = {
            options: {
                verifySignatures,
            },
        }
        client.getStreamPublishers = sinon.stub()
        client.getStreamPublishers.withArgs('streamId').resolves(publishers)
        client.getStream = sinon.stub()
        const stream = {
            requireSignedData,
        }
        client.getStream.withArgs('streamId').resolves(stream)
        return {
            client,
            stream,
        }
    }
    describe('signature verification', () => {
        describe('helper methods', () => {
            let client
            let stream
            beforeEach(() => {
                ({ client, stream } = setupClientAndStream())
                subscribedStream = new SubscribedStream(client, 'streamId')
            })
            describe('getPublishers', () => {
                it('should use endpoint to retrieve publishers', async () => {
                    const retrievedPublishers = await subscribedStream.getPublishers()
                    assert(client.getStreamPublishers.calledOnce)
                    assert.deepStrictEqual(publishers, retrievedPublishers)
                    assert.deepStrictEqual(await subscribedStream.publishersPromise, publishers)
                })
                it('should use stored publishers and not the endpoint', async () => {
                    subscribedStream.publishersPromise = Promise.resolve(publishers)
                    const retrievedPublishers = await subscribedStream.getPublishers()
                    assert(client.getStreamPublishers.notCalled)
                    assert.deepStrictEqual(publishers, retrievedPublishers)
                })
                it('should call getStreamProducers only once when multiple calls made simultaneously', () => {
                    const p1 = subscribedStream.getPublishers()
                    const p2 = subscribedStream.getPublishers()
                    return Promise.all([p1, p2]).then(([publishers1, publishers2]) => {
                        assert(client.getStreamPublishers.calledOnce)
                        assert.deepStrictEqual(publishers1, publishers2)
                    })
                })
            })
            describe('getStream', () => {
                it('should use endpoint to retrieve stream', async () => {
                    const retrievedStream = await subscribedStream.getStream()
                    assert(client.getStream.calledOnce)
                    assert.strictEqual(stream, retrievedStream)
                    assert.strictEqual(stream, await subscribedStream.streamPromise)
                })
                it('should use stored stream and not the endpoint', async () => {
                    subscribedStream.streamPromise = Promise.resolve(stream)
                    const retrievedStream = await subscribedStream.getStream()
                    assert(client.getStream.notCalled)
                    assert.strictEqual(stream, retrievedStream)
                })
                it('should call the endpoint only once when multiple calls made simultaneously', () => {
                    const p1 = subscribedStream.getStream()
                    const p2 = subscribedStream.getStream()
                    return Promise.all([p1, p2]).then(([stream1, stream2]) => {
                        assert(client.getStream.calledOnce)
                        assert.deepStrictEqual(stream1, stream2)
                    })
                })
            })
            describe('getVerifySignatures', () => {
                it('should set signature verification flag to true', async () => {
                    assert.strictEqual(subscribedStream.verifySignatures, undefined)
                    const retrievedFlag = await subscribedStream.getVerifySignatures()
                    assert(client.getStream.calledOnce)
                    assert.strictEqual(retrievedFlag, true)
                    assert.strictEqual(subscribedStream.verifySignatures, true)
                })
                it('should set signature verification flag to false', async () => {
                    client.getStream = sinon.stub()
                    client.getStream.withArgs('streamId').resolves({
                        requireSignedData: false,
                    })
                    assert.strictEqual(subscribedStream.verifySignatures, undefined)
                    const retrievedFlag = await subscribedStream.getVerifySignatures()
                    assert(client.getStream.calledOnce)
                    assert.strictEqual(retrievedFlag, false)
                    assert.strictEqual(subscribedStream.verifySignatures, false)
                })
            })
        })
        describe('verifyStreamMessage, signed message', () => {
            let msg
            let client
            let spiedVerifyStreamMessage
            let spiedExpectedCall
            beforeEach(async () => {
                const signer = new Signer({
                    privateKey: '0x348ce564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709',
                })
                const streamId = 'streamId'
                const data = {
                    field: 'some-data',
                }
                const timestamp = Date.now()
                msg = StreamMessage.create(
                    [streamId, 0, timestamp, 0, '', ''], null, StreamMessage.CONTENT_TYPES.JSON,
                    data, StreamMessage.SIGNATURE_TYPES.NONE,
                )
                await signer.signStreamMessage(msg)
                spiedVerifyStreamMessage = sinon.spy(Signer, 'verifyStreamMessage')
            })
            afterEach(async () => {
                subscribedStream = new SubscribedStream(client, 'streamId')
                const valid = await subscribedStream.verifyStreamMessage(msg)
                assert.strictEqual(valid, true)
                assert(spiedExpectedCall)
                spiedVerifyStreamMessage.restore()
            })
            it('should verify when "auto" verification and stream requires signed data', async () => {
                ({ client } = setupClientAndStream('auto', true))
                spiedExpectedCall = () => spiedVerifyStreamMessage.calledOnce
            })
            it('should return true without verifying when "auto" verification and stream does not require signed data', async () => {
                ({ client } = setupClientAndStream('auto', false))
                spiedExpectedCall = () => spiedVerifyStreamMessage.notCalled
            })
            it('should verify with "always" verification mode even if stream does not require signed data', async () => {
                ({ client } = setupClientAndStream('auto', true))
                spiedExpectedCall = () => spiedVerifyStreamMessage.calledOnce
            })
            it('should return true without verifying with "never" verification mode even if stream requires signed data', async () => {
                ({ client } = setupClientAndStream('never', true))
                spiedExpectedCall = () => spiedVerifyStreamMessage.notCalled
            })
        })
        describe('verifyStreamMessage, unsigned message', () => {
            let msg
            let client
            let expectedValid
            beforeEach(() => {
                const streamId = 'streamId'
                const data = {
                    field: 'some-data',
                }
                const timestamp = Date.now()
                msg = StreamMessage.create(
                    [streamId, 0, timestamp, 0, '', ''], null, StreamMessage.CONTENT_TYPES.JSON,
                    data, StreamMessage.SIGNATURE_TYPES.NONE,
                )
            })
            afterEach(async () => {
                subscribedStream = new SubscribedStream(client, 'streamId')
                const valid = await subscribedStream.verifyStreamMessage(msg)
                assert.strictEqual(valid, expectedValid)
            })
            it('should return false when "auto" verification and stream requires signed data', () => {
                ({ client } = setupClientAndStream('auto', true))
                expectedValid = false
            })
            it('should return true when "auto" verification and stream does not require signed data', () => {
                ({ client } = setupClientAndStream('auto', false))
                expectedValid = true
            })
            it('should return false when "always" verification even if stream does not require signed data', () => {
                ({ client } = setupClientAndStream('always', false))
                expectedValid = false
            })
            it('should return true when "never" verification even if stream requires signed data', () => {
                ({ client } = setupClientAndStream('never', true))
                expectedValid = true
            })
        })
    })
    describe('subscriptions', () => {
        let client
        let sub1
        beforeEach(() => {
            ({ client } = setupClientAndStream())
            subscribedStream = new SubscribedStream(client, 'streamId')
            sub1 = {
                id: 'sub1Id',
            }
        })
        it('should add and remove subscription correctly', () => {
            assert(subscribedStream.getSubscription(sub1.id) === undefined)
            subscribedStream.addSubscription(sub1)
            assert(subscribedStream.getSubscription(sub1.id) === sub1)
            subscribedStream.removeSubscription(sub1)
            assert(subscribedStream.getSubscription(sub1.id) === undefined)
        })
        it('should get subscriptions array', () => {
            subscribedStream.addSubscription(sub1)
            const sub2 = {
                id: 'sub2Id',
            }
            subscribedStream.addSubscription(sub2)
            assert.deepStrictEqual(subscribedStream.getSubscriptions(), [sub1, sub2])
        })
        it('should return true', () => {
            assert.strictEqual(subscribedStream.emptySubscriptionsSet(), true)
        })
    })
})

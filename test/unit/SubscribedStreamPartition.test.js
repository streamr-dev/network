import assert from 'assert'

import sinon from 'sinon'
import { MessageLayer } from 'streamr-client-protocol'

import SubscribedStreamPartition from '../../src/SubscribedStreamPartition'
import Signer from '../../src/Signer'
import RealTimeSubscription from '../../src/RealTimeSubscription'

const { StreamMessage } = MessageLayer

describe('SubscribedStreamPartition', () => {
    let subscribedStreamPartition
    const publishers = ['0xb8ce9ab6943e0eced004cde8e3bbed6568b2fa01'.toLowerCase(), 'publisher2', 'publisher3']
    const publishersMap = {}
    publishers.forEach((p) => {
        publishersMap[p] = true
    })

    function setupClientAndStream(verifySignatures = 'auto', requireSignedData = true) {
        const client = {
            options: {
                verifySignatures,
            },
        }
        client.getStreamPublishers = sinon.stub()
        client.getStreamPublishers.withArgs('streamId').resolves(publishers)
        client.isStreamPublisher = sinon.stub()
        client.isStreamPublisher.withArgs('streamId', 'publisher4').resolves(true)
        client.isStreamPublisher.withArgs('streamId', 'publisher5').resolves(false)

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
                subscribedStreamPartition = new SubscribedStreamPartition(client, 'streamId')
            })
            describe('getPublishers', () => {
                it('should use endpoint to retrieve publishers', async () => {
                    const retrievedPublishers = await subscribedStreamPartition.getPublishers()
                    assert(client.getStreamPublishers.calledOnce)
                    assert.deepStrictEqual(publishersMap, retrievedPublishers)
                    assert.deepStrictEqual(await subscribedStreamPartition.publishersPromise, publishersMap)
                })
                it('should use stored publishers and not the endpoint', async () => {
                    subscribedStreamPartition.publishersPromise = Promise.resolve(publishersMap)
                    const retrievedPublishers = await subscribedStreamPartition.getPublishers()
                    assert(client.getStreamPublishers.notCalled)
                    assert.deepStrictEqual(publishersMap, retrievedPublishers)
                })
                it('should call getStreamPublishers only once when multiple calls made simultaneously', () => {
                    const p1 = subscribedStreamPartition.getPublishers()
                    const p2 = subscribedStreamPartition.getPublishers()
                    return Promise.all([p1, p2]).then(([publishers1, publishers2]) => {
                        assert(client.getStreamPublishers.calledOnce)
                        assert.deepStrictEqual(publishers1, publishers2)
                    })
                })
                it('should use endpoint again after the list of locally stored publishers expires', async () => {
                    const clock = sinon.useFakeTimers()
                    await subscribedStreamPartition.getPublishers()
                    subscribedStreamPartition.publishersPromise = Promise.resolve(publishersMap)
                    await subscribedStreamPartition.getPublishers()
                    clock.tick(SubscribedStreamPartition.PUBLISHERS_EXPIRATION_TIME + 100)
                    await subscribedStreamPartition.getPublishers()
                    assert(client.getStreamPublishers.calledTwice)
                    clock.restore()
                })
            })
            describe('isValidPublisher', () => {
                it('should return cache result if cache hit', async () => {
                    const valid = await subscribedStreamPartition.isValidPublisher('publisher2')
                    assert.strictEqual(valid, true)
                    assert(client.getStreamPublishers.calledOnce)
                    assert(client.isStreamPublisher.notCalled)
                })
                it('should fetch if cache miss and store result in cache', async () => {
                    const valid4 = await subscribedStreamPartition.isValidPublisher('publisher4')
                    assert.strictEqual(valid4, true)
                    const valid5 = await subscribedStreamPartition.isValidPublisher('publisher5')
                    assert.strictEqual(valid5, false)
                    // calling the function again should use the cache
                    await subscribedStreamPartition.isValidPublisher('publisher4')
                    await subscribedStreamPartition.isValidPublisher('publisher5')
                    assert(client.getStreamPublishers.calledOnce)
                    assert(client.isStreamPublisher.calledTwice)
                })
            })
            describe('getStream', () => {
                it('should use endpoint to retrieve stream', async () => {
                    const retrievedStream = await subscribedStreamPartition.getStream()
                    assert(client.getStream.calledOnce)
                    assert.strictEqual(stream, retrievedStream)
                    assert.strictEqual(stream, await subscribedStreamPartition.streamPromise)
                })
                it('should use stored stream and not the endpoint', async () => {
                    subscribedStreamPartition.streamPromise = Promise.resolve(stream)
                    const retrievedStream = await subscribedStreamPartition.getStream()
                    assert(client.getStream.notCalled)
                    assert.strictEqual(stream, retrievedStream)
                })
                it('should call the endpoint only once when multiple calls made simultaneously', () => {
                    const p1 = subscribedStreamPartition.getStream()
                    const p2 = subscribedStreamPartition.getStream()
                    return Promise.all([p1, p2]).then(([stream1, stream2]) => {
                        assert(client.getStream.calledOnce)
                        assert.deepStrictEqual(stream1, stream2)
                    })
                })
            })
        })
        describe('verifyStreamMessage, signed message from untrusted publisher', () => {
            it('should not verify if the publisher is not trusted', async () => {
                const signer = new Signer({
                    privateKey: '0x948ce564d427a3311b6536bbcff9390d69311106ed6c486954e971d960fe8700',
                })
                const streamId = 'streamId'
                const data = {
                    field: 'some-data',
                }
                const timestamp = Date.now()
                const msg = StreamMessage.create(
                    [streamId, 0, timestamp, 0, '', ''], null, StreamMessage.CONTENT_TYPES.MESSAGE,
                    StreamMessage.ENCRYPTION_TYPES.NONE, data, StreamMessage.SIGNATURE_TYPES.NONE,
                )
                await signer.signStreamMessage(msg)
                const spiedVerifyStreamMessage = sinon.spy(Signer, 'verifyStreamMessage')
                subscribedStreamPartition = new SubscribedStreamPartition(setupClientAndStream('auto', true).client, 'streamId')
                const valid = await subscribedStreamPartition.verifyStreamMessage(msg)
                assert.strictEqual(valid, false)
                assert(spiedVerifyStreamMessage.notCalled)
                spiedVerifyStreamMessage.restore()
            })
        })
        describe('verifyStreamMessage, signed message from trusted publisher', () => {
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
                    [streamId, 0, timestamp, 0, '', ''], null, StreamMessage.CONTENT_TYPES.MESSAGE,
                    StreamMessage.ENCRYPTION_TYPES.NONE, data, StreamMessage.SIGNATURE_TYPES.NONE,
                )
                await signer.signStreamMessage(msg)
                spiedVerifyStreamMessage = sinon.spy(Signer, 'verifyStreamMessage')
            })
            afterEach(async () => {
                subscribedStreamPartition = new SubscribedStreamPartition(client, 'streamId')
                const valid = await subscribedStreamPartition.verifyStreamMessage(msg)
                assert.strictEqual(valid, true)
                assert(spiedExpectedCall())
                spiedVerifyStreamMessage.restore()
            })
            it('should verify when "auto" verification and stream requires signed data', async () => {
                ({ client } = setupClientAndStream('auto', true))
                spiedExpectedCall = () => spiedVerifyStreamMessage.calledOnce
            })
            it('should verify anyway when "auto" verification even if stream does not require signed data', async () => {
                ({ client } = setupClientAndStream('auto', false))
                spiedExpectedCall = () => spiedVerifyStreamMessage.called
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
                    [streamId, 0, timestamp, 0, '', ''], null, StreamMessage.CONTENT_TYPES.MESSAGE,
                    StreamMessage.ENCRYPTION_TYPES.NONE, data, StreamMessage.SIGNATURE_TYPES.NONE,
                )
            })
            afterEach(async () => {
                subscribedStreamPartition = new SubscribedStreamPartition(client, 'streamId')
                const valid = await subscribedStreamPartition.verifyStreamMessage(msg)
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
            subscribedStreamPartition = new SubscribedStreamPartition(client, 'streamId')
            sub1 = new RealTimeSubscription('sub1Id', 0, () => {})
        })
        it('should add and remove subscription correctly', () => {
            assert(subscribedStreamPartition.getSubscription(sub1.id) === undefined)
            subscribedStreamPartition.addSubscription(sub1)
            assert(subscribedStreamPartition.getSubscription(sub1.id) === sub1)
            subscribedStreamPartition.removeSubscription(sub1)
            assert(subscribedStreamPartition.getSubscription(sub1.id) === undefined)
        })
        it('should get subscriptions array', () => {
            subscribedStreamPartition.addSubscription(sub1)
            const sub2 = {
                id: 'sub2Id',
            }
            subscribedStreamPartition.addSubscription(sub2)
            assert.deepStrictEqual(subscribedStreamPartition.getSubscriptions(), [sub1, sub2])
        })
        it('should return true', () => {
            assert.strictEqual(subscribedStreamPartition.emptySubscriptionsSet(), true)
        })
        it('should call setGroupKeys() and checkQueue() for every subscription', async () => {
            const sub2 = {
                id: 'sub2Id',
                setGroupKeys: sinon.stub(),
            }
            const sub3 = {
                id: 'sub3Id',
                setGroupKeys: sinon.stub(),
            }
            subscribedStreamPartition.removeSubscription(sub1)
            subscribedStreamPartition.addSubscription(sub2)
            subscribedStreamPartition.addSubscription(sub3)

            await subscribedStreamPartition.setSubscriptionsGroupKeys('publisherId', ['group-key-1', 'group-key-2'])
            assert(sub2.setGroupKeys.calledWith('publisherId', ['group-key-1', 'group-key-2']))
            assert(sub3.setGroupKeys.calledWith('publisherId', ['group-key-1', 'group-key-2']))
        })
    })
})

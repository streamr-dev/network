import sinon from 'sinon'
import { MessageLayer } from 'streamr-client-protocol'
import { wait } from 'streamr-test-utils'

import SubscribedStreamPartition from '../../src/SubscribedStreamPartition'
import Signer from '../../src/Signer'
import RealTimeSubscription from '../../src/RealTimeSubscription'

const { StreamMessage, MessageIDStrict } = MessageLayer

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
        client.isStreamPublisher.withArgs('streamId', '0xb8CE9ab6943e0eCED004cDe8e3bBed6568B2Fa01').resolves(true)
        client.isStreamPublisher.withArgs('streamId', 'publisher2').resolves(true)
        client.isStreamPublisher.withArgs('streamId', 'publisher3').resolves(true)
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
                    expect(client.getStreamPublishers.callCount).toBe(1)
                    expect(publishersMap).toStrictEqual(retrievedPublishers)
                })

                it('should use stored publishers and not the endpoint', async () => {
                    const retrievedPublishers = await subscribedStreamPartition.getPublishers()
                    await subscribedStreamPartition.getPublishers()
                    expect(client.getStreamPublishers.callCount).toBe(1)
                    expect(publishersMap).toStrictEqual(retrievedPublishers)
                })

                it('should call getStreamPublishers only once when multiple calls made simultaneously', async () => {
                    const p1 = subscribedStreamPartition.getPublishers()
                    const p2 = subscribedStreamPartition.getPublishers()
                    const [publishers1, publishers2] = await Promise.all([p1, p2])
                    expect(client.getStreamPublishers.callCount).toBe(1)
                    expect(publishers1).toStrictEqual(publishers2)
                })

                describe('expiration', () => {
                    let oldMaxAge
                    beforeEach(() => {
                        // note: for some reason memoize doesn't seem to work with fake timers
                        oldMaxAge = SubscribedStreamPartition.memoizeOpts.maxAge
                        // reduce max age to something test-friendly
                        SubscribedStreamPartition.memoizeOpts.maxAge = 10
                        subscribedStreamPartition = new SubscribedStreamPartition(client, 'streamId')
                    })

                    afterEach(() => {
                        // restore max age
                        SubscribedStreamPartition.memoizeOpts.maxAge = oldMaxAge
                    })

                    it('should use endpoint again after the list of locally stored publishers expires', async () => {
                        await subscribedStreamPartition.getPublishers()
                        await subscribedStreamPartition.getPublishers()
                        expect(client.getStreamPublishers.callCount).toBe(1)
                        await wait(SubscribedStreamPartition.memoizeOpts.maxAge * 2)
                        await subscribedStreamPartition.getPublishers()
                        expect(client.getStreamPublishers.callCount).toBe(2)
                    })
                })
            })

            describe('isValidPublisher', () => {
                it('should return cache result if cache hit', async () => {
                    const valid = await subscribedStreamPartition.isValidPublisher('publisher2')
                    expect(valid).toBe(true)
                    expect(client.isStreamPublisher.callCount).toBe(1)
                    expect(client.getStreamPublishers.notCalled).toBeTruthy()
                })

                it('should fetch if cache miss and store result in cache', async () => {
                    const valid4 = await subscribedStreamPartition.isValidPublisher('publisher4')
                    expect(valid4).toBe(true)
                    const valid5 = await subscribedStreamPartition.isValidPublisher('publisher5')
                    expect(valid5).toBe(false)
                    // calling the function again should use the cache
                    await subscribedStreamPartition.isValidPublisher('publisher4')
                    await subscribedStreamPartition.isValidPublisher('publisher5')
                    expect(client.isStreamPublisher.callCount).toBe(2)
                    expect(client.getStreamPublishers.callCount).toBe(0)
                })
            })

            describe('getStream', () => {
                it('should use endpoint to retrieve stream', async () => {
                    const retrievedStream = await subscribedStreamPartition.getStream()
                    expect(client.getStream.calledOnce).toBeTruthy()
                    expect(stream).toBe(retrievedStream)
                })

                it('should call the endpoint only once when multiple calls made simultaneously', async () => {
                    const p1 = subscribedStreamPartition.getStream()
                    const p2 = subscribedStreamPartition.getStream()
                    const [stream1, stream2] = await Promise.all([p1, p2])
                    expect(client.getStream.calledOnce).toBeTruthy()
                    expect(stream1).toStrictEqual(stream2)
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
                const msg = new StreamMessage({
                    messageId: new MessageIDStrict(streamId, 0, timestamp, 0, signer.address, ''),
                    prevMesssageRef: null,
                    content: data,
                    messageType: StreamMessage.MESSAGE_TYPES.MESSAGE,
                    encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
                    signatureType: StreamMessage.SIGNATURE_TYPES.NONE,
                    signature: null,
                })

                await signer.signStreamMessage(msg)
                const spiedVerifyStreamMessage = sinon.spy(subscribedStreamPartition.validator, 'validate')
                subscribedStreamPartition = new SubscribedStreamPartition(setupClientAndStream('auto', true).client, 'streamId')
                await expect(() => (
                    subscribedStreamPartition.verifyStreamMessage(msg)
                )).rejects.toThrow()
                expect(spiedVerifyStreamMessage.notCalled).toBeTruthy()
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
                msg = new StreamMessage({
                    messageId: new MessageIDStrict(streamId, 0, timestamp, 0, '' /* no publisher id */, ''),
                    prevMesssageRef: null,
                    content: data,
                    messageType: StreamMessage.MESSAGE_TYPES.MESSAGE,
                    encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
                    signatureType: StreamMessage.SIGNATURE_TYPES.NONE,
                    signature: null,
                })
                await signer.signStreamMessage(msg)
            })

            afterEach(async () => {
                subscribedStreamPartition = new SubscribedStreamPartition(client, 'streamId')
                spiedVerifyStreamMessage = sinon.spy(subscribedStreamPartition.validator, 'validate')
                await subscribedStreamPartition.verifyStreamMessage(msg)
                expect(spiedExpectedCall()).toBeTruthy()
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
                msg = new StreamMessage({
                    messageId: new MessageIDStrict(streamId, 0, timestamp, 0, '', ''),
                    prevMesssageRef: null,
                    content: data,
                    messageType: StreamMessage.MESSAGE_TYPES.MESSAGE,
                    encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
                    signatureType: StreamMessage.SIGNATURE_TYPES.NONE,
                    signature: null,
                })
            })

            afterEach(async () => {
                subscribedStreamPartition = new SubscribedStreamPartition(client, 'streamId')
                let valid
                try {
                    await subscribedStreamPartition.verifyStreamMessage(msg)
                    valid = true
                } catch (err) {
                    valid = false
                }
                expect(valid).toBe(expectedValid)
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
            sub1 = new RealTimeSubscription({
                streamId: 'sub1Id',
                callback: () => {},
            })
        })

        it('should add and remove subscription correctly', () => {
            expect(subscribedStreamPartition.getSubscription(sub1.id) === undefined).toBeTruthy()
            subscribedStreamPartition.addSubscription(sub1)
            expect(subscribedStreamPartition.getSubscription(sub1.id) === sub1).toBeTruthy()
            subscribedStreamPartition.removeSubscription(sub1)
            expect(subscribedStreamPartition.getSubscription(sub1.id) === undefined).toBeTruthy()
        })

        it('should get subscriptions array', () => {
            subscribedStreamPartition.addSubscription(sub1)
            const sub2 = {
                id: 'sub2Id',
            }
            subscribedStreamPartition.addSubscription(sub2)
            expect(subscribedStreamPartition.getSubscriptions()).toStrictEqual([sub1, sub2])
        })

        it('should return true', () => {
            expect(subscribedStreamPartition.emptySubscriptionsSet()).toBe(true)
        })
    })
})

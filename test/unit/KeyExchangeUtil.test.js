import crypto from 'crypto'

import sinon from 'sinon'
import { MessageLayer } from 'streamr-client-protocol'

import KeyExchangeUtil from '../../src/KeyExchangeUtil'
import EncryptionUtil from '../../src/EncryptionUtil'
import KeyStorageUtil from '../../src/KeyStorageUtil'
import InvalidGroupKeyResponseError from '../../src/errors/InvalidGroupKeyResponseError'
import InvalidGroupKeyRequestError from '../../src/errors/InvalidGroupKeyRequestError'
import { uid } from '../utils'

const { StreamMessage, MessageIDStrict } = MessageLayer
const subscribers = ['0xb8CE9ab6943e0eCED004cDe8e3bBed6568B2Fa01'.toLowerCase(), 'subscriber2', 'subscriber3']
const subscribersMap = {}
subscribers.forEach((p) => {
    subscribersMap[p] = true
})

async function setupClient() {
    const client = {}
    client.getStreamSubscribers = sinon.stub()
    client.getStreamSubscribers.withArgs('streamId').resolves(subscribers)
    client.isStreamSubscriber = sinon.stub()
    client.isStreamSubscriber.withArgs('streamId', 'subscriber4').resolves(true)
    client.isStreamSubscriber.withArgs('streamId', 'subscriber5').resolves(false)
    client.keyStorageUtil = KeyStorageUtil.getKeyStorageUtil()
    client.keyStorageUtil.addKey('streamId', crypto.randomBytes(32), 5)
    client.keyStorageUtil.addKey('streamId', crypto.randomBytes(32), 12)
    client.keyStorageUtil.addKey('streamId', crypto.randomBytes(32), 17)
    client.keyStorageUtil.addKey('streamId', crypto.randomBytes(32), 25)
    client.keyStorageUtil.addKey('streamId', crypto.randomBytes(32), 35)
    client.subscribedStreamPartitions = {
        streamId0: { // 'streamId' + 0 (stream partition)
            setSubscriptionsGroupKey: sinon.stub(),
        },
    }
    client.encryptionUtil = new EncryptionUtil()
    await client.encryptionUtil.onReady()
    return client
}

describe('KeyExchangeUtil', () => {
    let client
    let util
    beforeEach(async () => {
        client = await setupClient()
        util = new KeyExchangeUtil(client)
    })

    describe('getSubscribers', () => {
        it('should use endpoint to retrieve subscribers', async () => {
            const retrievedSubscribers = await util.getSubscribers('streamId')
            expect(client.getStreamSubscribers.calledOnce).toBeTruthy()
            expect(subscribersMap).toStrictEqual(retrievedSubscribers)
            expect(await util.subscribersPromise).toStrictEqual(subscribersMap)
        })

        it('should use stored subscribers and not the endpoint', async () => {
            util.subscribersPromise = Promise.resolve(subscribersMap)
            const retrievedSubscribers = await util.getSubscribers('streamId')
            expect(client.getStreamSubscribers.notCalled).toBeTruthy()
            expect(subscribersMap).toStrictEqual(retrievedSubscribers)
        })

        it('should call getStreamPublishers only once when multiple calls made simultaneously', async () => {
            const p1 = util.getSubscribers('streamId')
            const p2 = util.getSubscribers('streamId')
            const [subscribers1, subscribers2] = await Promise.all([p1, p2])
            expect(client.getStreamSubscribers.calledOnce).toBeTruthy()
            expect(subscribers1).toStrictEqual(subscribers2)
        })

        it('should use endpoint again after the list of locally stored publishers expires', async () => {
            const clock = sinon.useFakeTimers()
            await util.getSubscribers('streamId')
            util.subscribersPromise = Promise.resolve(subscribersMap)
            await util.getSubscribers('streamId')
            clock.tick(KeyExchangeUtil.SUBSCRIBERS_EXPIRATION_TIME + 100)
            await util.getSubscribers('streamId')
            expect(client.getStreamSubscribers.calledTwice).toBeTruthy()
            clock.restore()
        })
    })

    describe('handleGroupKeyRequest', () => {
        it('should reject request for a stream for which the client does not have a group key', async (done) => {
            const requestId = uid('requestId')
            const streamMessage = new StreamMessage({
                messageId: new MessageIDStrict('clientInboxAddress', 0, Date.now(), 0, 'subscriber2', ''),
                prevMsgRef: null,
                content: {
                    streamId: 'wrong-streamId',
                    publicKey: 'rsa-public-key',
                    requestId,
                },
                contentType: StreamMessage.CONTENT_TYPES.GROUP_KEY_REQUEST,
                encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
                signatureType: StreamMessage.SIGNATURE_TYPES.ETH,
                signature: 'signature',
            })

            await util.handleGroupKeyRequest(streamMessage).catch((err) => {
                expect(err).toBeInstanceOf(InvalidGroupKeyRequestError)
                expect(err.message).toBe('Received group key request for stream \'wrong-streamId\' but no group key is set')
                done()
            })
        })

        it('should send group key response (latest key)', async (done) => {
            const requestId = uid('requestId')
            const subscriberKeyPair = new EncryptionUtil()
            await subscriberKeyPair.onReady()
            const streamMessage = new StreamMessage({
                messageId: new MessageIDStrict('clientInboxAddress', 0, Date.now(), 0, 'subscriber2', ''),
                prevMsgRef: null,
                content: {
                    streamId: 'streamId',
                    publicKey: subscriberKeyPair.getPublicKey(),
                    requestId,
                },
                contentType: StreamMessage.CONTENT_TYPES.GROUP_KEY_REQUEST,
                encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
                signatureType: StreamMessage.SIGNATURE_TYPES.ETH,
                signature: 'signature',
            })

            client.msgCreationUtil = {
                createGroupKeyResponse: ({ subscriberAddress, streamId, encryptedGroupKeys }) => {
                    expect(subscriberAddress).toBe('subscriber2')
                    expect(streamId).toBe('streamId')
                    expect(encryptedGroupKeys.length).toBe(1)
                    const keyObject = encryptedGroupKeys[0]
                    const expectedKeyObj = client.keyStorageUtil.getLatestKey('streamId')
                    expect(subscriberKeyPair.decryptWithPrivateKey(keyObject.groupKey, true)).toStrictEqual(expectedKeyObj.groupKey)
                    expect(keyObject.start).toStrictEqual(expectedKeyObj.start)
                    return Promise.resolve('fake response')
                },
            }
            client.publishStreamMessage = (response) => {
                expect(response).toBe('fake response')
                done()
            }

            await util.handleGroupKeyRequest(streamMessage)
        })

        it('should send group key response (range of keys)', async (done) => {
            const requestId = uid('requestId')
            const subscriberKeyPair = new EncryptionUtil()
            await subscriberKeyPair.onReady()
            const streamMessage = new StreamMessage({
                messageId: new MessageIDStrict('clientInboxAddress', 0, Date.now(), 0, 'subscriber2', ''),
                prevMsgRef: null,
                content: {
                    streamId: 'streamId',
                    publicKey: subscriberKeyPair.getPublicKey(),
                    requestId,
                    range: {
                        start: 15,
                        end: 27
                    }
                },
                contentType: StreamMessage.CONTENT_TYPES.GROUP_KEY_REQUEST,
                encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
                signatureType: StreamMessage.SIGNATURE_TYPES.ETH,
                signature: 'signature',
            })

            client.msgCreationUtil = {
                createGroupKeyResponse: ({ subscriberAddress, streamId, encryptedGroupKeys }) => {
                    expect(subscriberAddress).toBe('subscriber2')
                    expect(streamId).toBe('streamId')
                    const decryptedKeys = []
                    encryptedGroupKeys.forEach((keyObj) => {
                        const decryptedKey = subscriberKeyPair.decryptWithPrivateKey(keyObj.groupKey, true)
                        decryptedKeys.push({
                            groupKey: decryptedKey,
                            start: keyObj.start
                        })
                    })
                    expect(decryptedKeys).toStrictEqual(client.keyStorageUtil.getKeysBetween('streamId', 15, 27))
                    return Promise.resolve('fake response')
                },
            }

            client.publishStreamMessage = (response) => {
                expect(response).toBe('fake response')
                done()
            }

            await util.handleGroupKeyRequest(streamMessage)
        })

        it('should send group key response (latest key and no storage of past keys)', async (done) => {
            const requestId = uid('requestId')
            const subscriberKeyPair = new EncryptionUtil()
            await subscriberKeyPair.onReady()
            const streamMessage = new StreamMessage({
                messageId: new MessageIDStrict('clientInboxAddress', 0, Date.now(), 0, 'subscriber2', ''),
                prevMsgRef: null,
                content: {
                    requestId,
                    streamId: 'streamId',
                    publicKey: subscriberKeyPair.getPublicKey(),
                },
                contentType: StreamMessage.CONTENT_TYPES.GROUP_KEY_REQUEST,
                encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
                signatureType: StreamMessage.SIGNATURE_TYPES.ETH,
                signature: 'signature',
            })
            client.msgCreationUtil = {
                createGroupKeyResponse: ({ subscriberAddress, streamId, encryptedGroupKeys }) => {
                    expect(subscriberAddress).toBe('subscriber2')
                    expect(streamId).toBe('streamId')
                    expect(encryptedGroupKeys.length).toBe(1)
                    const keyObject = encryptedGroupKeys[0]
                    const expectedKeyObj = client.keyStorageUtil.getLatestKey('streamId')
                    expect(subscriberKeyPair.decryptWithPrivateKey(keyObject.groupKey, true)).toStrictEqual(expectedKeyObj.groupKey)
                    expect(keyObject.start).toStrictEqual(expectedKeyObj.start)
                    return Promise.resolve('fake response')
                },
            }
            client.publishStreamMessage = (response) => {
                expect(response).toBe('fake response')
                done()
            }
            util.handleGroupKeyRequest(streamMessage)
        })
    })

    describe('handleGroupKeyResponse', () => {
        it('should reject response for a stream to which the client is not subscribed', async (done) => {
            const requestId = uid('requestId')
            const streamMessage = new StreamMessage({
                messageId: new MessageIDStrict('clientInboxAddress', 0, Date.now(), 0, 'publisherId', ''),
                prevMsgRef: null,
                content: {
                    streamId: 'wrong-streamId',
                    requestId,
                    keys: [{
                        groupKey: 'encrypted-group-key',
                        start: 54256,
                    }],
                },
                contentType: StreamMessage.CONTENT_TYPES.GROUP_KEY_RESPONSE_SIMPLE,
                encryptionType: StreamMessage.ENCRYPTION_TYPES.RSA,
                signatureType: StreamMessage.SIGNATURE_TYPES.ETH,
                signature: 'signature',
            })

            try {
                util.handleGroupKeyResponse(streamMessage)
            } catch (err) {
                expect(err).toBeInstanceOf(InvalidGroupKeyResponseError)
                expect(err.message).toBe('Received group key response for a stream to which the client is not subscribed.')
                done()
            }
        })

        it('should reject response with invalid group key', async (done) => {
            const requestId = uid('requestId')
            const encryptedGroupKey = EncryptionUtil.encryptWithPublicKey(crypto.randomBytes(16), client.encryptionUtil.getPublicKey(), true)
            const streamMessage = new StreamMessage({
                messageId: new MessageIDStrict('clientInboxAddress', 0, Date.now(), 0, 'publisherId', ''),
                prevMsgRef: null,
                content: {
                    streamId: 'streamId',
                    requestId,
                    keys: [{
                        groupKey: encryptedGroupKey,
                        start: 54256,
                    }],
                },
                contentType: StreamMessage.CONTENT_TYPES.GROUP_KEY_RESPONSE_SIMPLE,
                encryptionType: StreamMessage.ENCRYPTION_TYPES.RSA,
                signatureType: StreamMessage.SIGNATURE_TYPES.ETH,
                signature: 'signature',
            })
            try {
                util.handleGroupKeyResponse(streamMessage)
            } catch (err) {
                expect(err).toBeInstanceOf(InvalidGroupKeyResponseError)
                expect(err.message).toBe('Group key must have a size of 256 bits, not 128')
                done()
            }
        })

        it('should update client options and subscriptions with received group key', async (done) => {
            const requestId = uid('requestId')
            const groupKey = crypto.randomBytes(32)
            const encryptedGroupKey = EncryptionUtil.encryptWithPublicKey(groupKey, client.encryptionUtil.getPublicKey(), true)
            const streamMessage = new StreamMessage({
                messageId: new MessageIDStrict('clientInboxAddress', 0, Date.now(), 0, 'publisherId', ''),
                prevMsgRef: null,
                content: {
                    streamId: 'streamId',
                    requestId,
                    keys: [{
                        groupKey: encryptedGroupKey,
                        start: 54256,
                    }],
                },
                contentType: StreamMessage.CONTENT_TYPES.GROUP_KEY_RESPONSE_SIMPLE,
                encryptionType: StreamMessage.ENCRYPTION_TYPES.RSA,
                signatureType: StreamMessage.SIGNATURE_TYPES.ETH,
                signature: 'signature',
            })

            // eslint-disable-next-line no-underscore-dangle
            client._setGroupKeys = (streamId, publisherId, keys) => {
                expect(streamId).toBe('streamId')
                expect(publisherId).toBe('publisherId')
                expect(keys).toStrictEqual([{
                    groupKey,
                    start: 54256
                }])
                done()
            }
            await util.handleGroupKeyResponse(streamMessage)
        })
    })
})

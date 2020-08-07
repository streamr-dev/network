import crypto from 'crypto'

import sinon from 'sinon'
import { ethers } from 'ethers'
import { MessageLayer } from 'streamr-client-protocol'
import uniqueId from 'lodash.uniqueid'

import MessageCreationUtil from '../../src/MessageCreationUtil'
import Stream from '../../src/rest/domain/Stream'
import KeyStorageUtil from '../../src/KeyStorageUtil'
import KeyExchangeUtil from '../../src/KeyExchangeUtil'
import InvalidGroupKeyRequestError from '../../src/errors/InvalidGroupKeyRequestError'

const { StreamMessage, MessageID, MessageRef } = MessageLayer
const { getKeyExchangeStreamId } = KeyExchangeUtil

describe('MessageCreationUtil', () => {
    const hashedUsername = '0x16F78A7D6317F102BBD95FC9A4F3FF2E3249287690B8BDAD6B7810F82B34ACE3'.toLowerCase()

    describe('getPublisherId', () => {
        it('uses address', async () => {
            const wallet = ethers.Wallet.createRandom()
            const client = {
                options: {
                    auth: {
                        privateKey: wallet.privateKey,
                    },
                },
                getUserInfo: sinon.stub().resolves({
                    username: 'username',
                }),
            }
            const msgCreationUtil = new MessageCreationUtil(client.options.auth, undefined, client.getUserInfo)
            const publisherId = await msgCreationUtil.getPublisherId()
            expect(publisherId).toBe(wallet.address.toLowerCase())
        })

        it('uses hash of username', async () => {
            const client = {
                options: {
                    auth: {
                        apiKey: 'apiKey',
                    },
                },
                getUserInfo: sinon.stub().resolves({
                    username: 'username',
                }),
            }
            const msgCreationUtil = new MessageCreationUtil(client.options.auth, undefined, client.getUserInfo)
            const publisherId = await msgCreationUtil.getPublisherId()
            expect(publisherId).toBe(hashedUsername)
        })

        it('uses hash of username', async () => {
            const client = {
                options: {
                    auth: {
                        username: 'username',
                    },
                },
                getUserInfo: sinon.stub().resolves({
                    username: 'username',
                }),
            }
            const msgCreationUtil = new MessageCreationUtil(client.options.auth, undefined, client.getUserInfo)
            const publisherId = await msgCreationUtil.getPublisherId()
            expect(publisherId).toBe(hashedUsername)
        })

        it('uses hash of username', async () => {
            const client = {
                options: {
                    auth: {
                        sessionToken: 'session-token',
                    },
                },
                getUserInfo: sinon.stub().resolves({
                    username: 'username',
                }),
            }
            const msgCreationUtil = new MessageCreationUtil(client.options.auth, undefined, client.getUserInfo)
            const publisherId = await msgCreationUtil.getPublisherId()
            expect(publisherId).toBe(hashedUsername)
        })
    })

    describe('partitioner', () => {
        it('should throw if partition count is not defined', () => {
            expect(() => {
                new MessageCreationUtil().computeStreamPartition(undefined, 'foo')
            }).toThrow()
        })

        it('should always return partition 0 for all keys if partition count is 1', () => {
            for (let i = 0; i < 100; i++) {
                expect(new MessageCreationUtil().computeStreamPartition(1, `foo${i}`)).toEqual(0)
            }
        })

        it('should use md5 partitioner and produce same results as crypto.createHash(md5).update(string).digest()', () => {
            const keys = []
            for (let i = 0; i < 100; i++) {
                keys.push(`key-${i}`)
            }
            // Results must be the same as those produced by md5
            const correctResults = [6, 7, 4, 4, 9, 1, 8, 0, 6, 6, 7, 6, 7, 3, 2, 2, 0, 9, 4, 9, 9, 5, 5,
                1, 7, 3, 0, 6, 5, 6, 3, 6, 3, 5, 6, 2, 3, 6, 7, 2, 1, 3, 2, 7, 1, 1, 5, 1, 4, 0, 1, 9, 7,
                4, 2, 3, 2, 9, 7, 7, 4, 3, 5, 4, 5, 3, 9, 0, 4, 8, 1, 7, 4, 8, 1, 2, 9, 9, 5, 3, 5, 0, 9,
                4, 3, 9, 6, 7, 8, 6, 4, 6, 0, 1, 1, 5, 8, 3, 9, 7]

            expect(correctResults.length).toEqual(keys.length)

            for (let i = 0; i < keys.length; i++) {
                const partition = new MessageCreationUtil().computeStreamPartition(10, keys[i])
                expect(correctResults[i]).toStrictEqual(partition)
            }
        })
    })

    describe('createStreamMessage()', () => {
        const pubMsg = {
            foo: 'bar',
        }

        const stream = new Stream(null, {
            id: 'streamId',
            partitions: 1,
        })

        let client
        let msgCreationUtil

        beforeEach(() => {
            client = {
                options: {
                    auth: {
                        username: 'username',
                    },
                },
                signer: {
                    signStreamMessage: (streamMessage) => {
                        /* eslint-disable no-param-reassign */
                        streamMessage.signatureType = StreamMessage.SIGNATURE_TYPES.ETH
                        streamMessage.signature = 'signature'
                        /* eslint-enable no-param-reassign */
                        return Promise.resolve()
                    },
                },
                getUserInfo: () => Promise.resolve({
                    username: 'username',
                }),
                getStream: sinon.stub().resolves(stream),
            }
            msgCreationUtil = new MessageCreationUtil(client.options.auth, client.signer, client.getUserInfo(), client.getStream)
        })

        afterAll(() => {
            msgCreationUtil.stop()
        })

        function getStreamMessage(streamId, timestamp, sequenceNumber, prevMsgRef) {
            return new StreamMessage({
                messageId: new MessageID(streamId, 0, timestamp, sequenceNumber, hashedUsername, msgCreationUtil.msgChainId),
                prevMesssageRef: prevMsgRef,
                content: pubMsg,
                messageType: StreamMessage.MESSAGE_TYPES.MESSAGE,
                encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
                signatureType: StreamMessage.SIGNATURE_TYPES.ETH,
                signature: 'signature',
            })
        }

        it('should create messages with increasing sequence numbers', async () => {
            const ts = Date.now()
            const promises = []
            let prevMsgRef = null
            for (let i = 0; i < 10; i++) {
                /* eslint-disable no-loop-func */
                prevMsgRef = new MessageRef(ts, i)
                promises.push(async () => {
                    const streamMessage = await msgCreationUtil.createStreamMessage(stream, pubMsg, ts)
                    expect(streamMessage).toStrictEqual(getStreamMessage('streamId', ts, i, prevMsgRef))
                })
                /* eslint-enable no-loop-func */
            }
            await Promise.all(promises)
        })

        it('should create messages with sequence number 0', async () => {
            const ts = Date.now()
            const promises = []
            let prevMsgRef = null
            for (let i = 0; i < 10; i++) {
                prevMsgRef = new MessageRef(ts + i, i)
                /* eslint-disable no-loop-func */
                promises.push(async () => {
                    const streamMessage = await msgCreationUtil.createStreamMessage(stream, pubMsg, ts + i)
                    expect(streamMessage).toStrictEqual(getStreamMessage('streamId', ts + i, 0, prevMsgRef))
                })
                /* eslint-enable no-loop-func */
            }
            await Promise.all(promises)
        })

        it('should publish messages with sequence number 0 (different streams)', async () => {
            const ts = Date.now()
            const stream2 = new Stream(null, {
                id: 'streamId2',
                partitions: 1,
            })
            const stream3 = new Stream(null, {
                id: 'streamId3',
                partitions: 1,
            })

            const msg1 = await msgCreationUtil.createStreamMessage(stream, pubMsg, ts)
            const msg2 = await msgCreationUtil.createStreamMessage(stream2, pubMsg, ts)
            const msg3 = await msgCreationUtil.createStreamMessage(stream3, pubMsg, ts)

            expect(msg1).toEqual(getStreamMessage('streamId', ts, 0, null))
            expect(msg2).toEqual(getStreamMessage('streamId2', ts, 0, null))
            expect(msg3).toEqual(getStreamMessage('streamId3', ts, 0, null))
        })

        it('should sign messages if signer is defined', async () => {
            const msg1 = await msgCreationUtil.createStreamMessage(stream, pubMsg, Date.now())
            expect(msg1.signature).toBe('signature')
        })

        it('should create message from a stream id by fetching the stream', async () => {
            const ts = Date.now()
            const streamMessage = await msgCreationUtil.createStreamMessage(stream.id, pubMsg, ts)
            expect(streamMessage).toEqual(getStreamMessage(stream.id, ts, 0, null))
        })
    })

    describe.skip('encryption', () => {
        const pubMsg = {
            foo: 'bar',
        }

        const stream = new Stream(null, {
            id: 'streamId',
            partitions: 1,
        })

        let client

        beforeEach(() => {
            client = {
                options: {
                    auth: {
                        username: 'username',
                    },
                },
                signer: {
                    signStreamMessage: (streamMessage) => {
                        /* eslint-disable no-param-reassign */
                        streamMessage.signatureType = StreamMessage.SIGNATURE_TYPES.ETH
                        streamMessage.signature = 'signature'
                        /* eslint-enable no-param-reassign */
                        return Promise.resolve()
                    },
                },
                getUserInfo: () => Promise.resolve({
                    username: 'username',
                }),
                getStream: sinon.stub().resolves(stream),
            }
        })

        it('should create cleartext messages when no key is defined', async () => {
            const msgCreationUtil = new MessageCreationUtil(client.options.auth, client.signer, client.getUserInfo(), client.getStream)
            const msg = await msgCreationUtil.createStreamMessage(stream, pubMsg, Date.now())
            expect(msg.encryptionType).toBe(StreamMessage.ENCRYPTION_TYPES.NONE)
            expect(msg.getParsedContent()).toEqual(pubMsg)
        })

        it('should create encrypted messages when key defined in constructor', async () => {
            const key = crypto.randomBytes(32)
            const keyStorageUtil = KeyStorageUtil.getKeyStorageUtil()
            keyStorageUtil.addKey(stream.id, key)

            const msgCreationUtil = new MessageCreationUtil(
                client.options.auth, client.signer, client.getUserInfo(), client.getStream, keyStorageUtil,
            )
            const msg = await msgCreationUtil.createStreamMessage(stream, pubMsg, Date.now())
            expect(msg.encryptionType).toBe(StreamMessage.ENCRYPTION_TYPES.AES)
            expect(msg.getSerializedContent().length).toBe(58) // 16*2 + 13*2 (hex string made of IV + msg of 13 chars)
        })

        it('should throw when using a key with a size smaller than 256 bits', (done) => {
            const key = crypto.randomBytes(16)
            const msgCreationUtil = new MessageCreationUtil(client.options.auth, client.signer, client.getUserInfo(), client.getStream)
            msgCreationUtil.createStreamMessage(stream, pubMsg, Date.now(), null, key).catch((err) => {
                expect(err.toString()).toBe('Error: Group key must have a size of 256 bits, not 128')
                done()
            })
        })

        it('should create encrypted messages when key defined in createStreamMessage() and use the same key later', async () => {
            const key = crypto.randomBytes(32)
            const msgCreationUtil = new MessageCreationUtil(client.options.auth, client.signer, client.getUserInfo(), client.getStream)
            const msg1 = await msgCreationUtil.createStreamMessage(stream, pubMsg, Date.now(), null, key)
            expect(msg1.encryptionType).toBe(StreamMessage.ENCRYPTION_TYPES.AES)
            expect(msg1.getSerializedContent().length).toBe(58)
            const msg2 = await msgCreationUtil.createStreamMessage(stream, pubMsg, Date.now())
            expect(msg2.encryptionType).toBe(StreamMessage.ENCRYPTION_TYPES.AES)
            expect(msg2.getSerializedContent().length).toBe(58)
            // should use different IVs
            expect(msg1.getSerializedContent().slice(0, 32)).not.toEqual(msg2.getSerializedContent().slice(0, 32))
            // should produce different ciphertexts even if same plaintexts and same key
            expect(msg1.getSerializedContent().slice(32)).not.toEqual(msg2.getSerializedContent().slice(32))
        })

        it('should update the key when redefined', async () => {
            const key1 = crypto.randomBytes(32)
            const key2 = crypto.randomBytes(32)
            const msgCreationUtil = new MessageCreationUtil(client.options.auth, client.signer, client.getUserInfo(), client.getStream)
            const msg1 = await msgCreationUtil.createStreamMessage(stream, pubMsg, Date.now(), null, key1)
            expect(msg1.encryptionType).toBe(StreamMessage.ENCRYPTION_TYPES.AES)
            expect(msg1.getSerializedContent().length).toBe(58)
            const msg2 = await msgCreationUtil.createStreamMessage(stream, pubMsg, Date.now(), null, key2)
            expect(msg2.encryptionType).toBe(StreamMessage.ENCRYPTION_TYPES.NEW_KEY_AND_AES)
            expect(msg2.getSerializedContent().length).toBe(122)// 16*2 + 32*2 + 13*2 (IV + key of 32 bytes + msg of 13 chars)
        })
    })

    describe.skip('createGroupKeyRequest', () => {
        const stream = new Stream(null, {
            id: 'streamId',
            partitions: 1,
        })

        const auth = {
            username: 'username',
        }

        it('should not be able to create unsigned group key request', async (done) => {
            const util = new MessageCreationUtil(auth, null, () => Promise.resolve({
                username: 'username',
            }), sinon.stub().resolves(stream))

            await util.createGroupKeyRequest({
                messagePublisherAddress: 'publisherId',
                streamId: 'streamId',
                publicKey: 'rsaPublicKey',
                start: 1354155,
                end: 2344155,
            }).catch((err) => {
                expect(err.message).toBe('Cannot create unsigned group key request. Must authenticate with "privateKey" or "provider"')
                done()
            })
        })

        it('creates correct group key request', async () => {
            const signer = {
                signStreamMessage: (streamMessage) => {
                    /* eslint-disable no-param-reassign */
                    streamMessage.signatureType = StreamMessage.SIGNATURE_TYPES.ETH
                    streamMessage.signature = 'signature'
                    /* eslint-enable no-param-reassign */
                    return Promise.resolve()
                },
            }

            const util = new MessageCreationUtil(auth, signer, () => Promise.resolve({
                username: 'username',
            }), sinon.stub().resolves(stream))

            const streamMessage = await util.createGroupKeyRequest({
                messagePublisherAddress: 'publisherId',
                streamId: 'streamId',
                publicKey: 'rsaPublicKey',
                start: 1354155,
                end: 2344155,
            })

            expect(streamMessage.getStreamId()).toBe(getKeyExchangeStreamId('publisherId')) // sending to publisher's keyexchange stream
            const content = streamMessage.getParsedContent()
            expect(streamMessage.messageType).toBe(StreamMessage.MESSAGE_TYPES.GROUP_KEY_REQUEST)
            expect(streamMessage.encryptionType).toBe(StreamMessage.ENCRYPTION_TYPES.NONE)
            expect(content.streamId).toBe('streamId')
            expect(content.publicKey).toBe('rsaPublicKey')
            expect(content.range.start).toBe(1354155)
            expect(content.range.end).toBe(2344155)
            expect(streamMessage.signature).toBeTruthy()
        })
    })

    describe.skip('createGroupKeyResponse', () => {
        const stream = new Stream(null, {
            id: 'streamId',
            partitions: 1,
        })

        const auth = {
            username: 'username',
        }

        it('should not be able to create unsigned group key response', async (done) => {
            const util = new MessageCreationUtil(auth, null, () => Promise.resolve({
                username: 'username',
            }), sinon.stub().resolves(stream))
            const requestId = uniqueId()
            await util.createGroupKeyResponse({
                subscriberAddress: 'subscriberId',
                streamId: 'streamId',
                requestId,
                encryptedGroupKeys: [{
                    groupKey: 'group-key',
                    start: 34524,
                }]
            }).catch((err) => {
                expect(err.message).toBe('Cannot create unsigned group key response. Must authenticate with "privateKey" or "provider"')
                done()
            })
        })

        it.skip('creates correct group key response', async () => {
            const signer = {
                signStreamMessage: (streamMessage) => {
                    /* eslint-disable no-param-reassign */
                    streamMessage.signatureType = StreamMessage.SIGNATURE_TYPES.ETH
                    streamMessage.signature = 'signature'
                    /* eslint-enable no-param-reassign */
                    return Promise.resolve()
                },
            }

            const util = new MessageCreationUtil(auth, signer, () => Promise.resolve({
                username: 'username',
            }), sinon.stub().resolves(stream))

            const requestId = uniqueId()
            const streamMessage = await util.createGroupKeyResponse({
                subscriberAddress: 'subscriberId',
                streamId: 'streamId',
                requestId,
                encryptedGroupKeys: [{
                    groupKey: 'encrypted-group-key',
                    start: 34524,
                }]
            })

            expect(streamMessage.getStreamId()).toBe(getKeyExchangeStreamId('subscriberId')) // sending to subscriber's keyexchange stream
            const content = streamMessage.getParsedContent()
            expect(streamMessage.messageType).toBe(StreamMessage.MESSAGE_TYPES.GROUP_KEY_RESPONSE)
            expect(streamMessage.encryptionType).toBe(StreamMessage.ENCRYPTION_TYPES.RSA)
            expect(content.streamId).toBe('streamId')
            expect(content.requestId).toBe(requestId)
            expect(content.keys).toStrictEqual([{
                groupKey: 'encrypted-group-key',
                start: 34524,
            }])
            expect(streamMessage.signature).toBeTruthy()
        })
    })

    describe.skip('createErrorMessage', () => {
        const stream = new Stream(null, {
            id: 'streamId',
            partitions: 1,
        })

        const auth = {
            username: 'username',
        }

        it('should not be able to create unsigned error message', async (done) => {
            const util = new MessageCreationUtil(auth, null, () => Promise.resolve({
                username: 'username',
            }), sinon.stub().resolves(stream))

            await util.createErrorMessage({
                keyExchangeStreamId: 'keyExchangeStreamId',
                error: new Error(),
                streamId: stream.id,
                requestId: uniqueId('requestId'),
            }).catch((err) => {
                expect(err.message).toBe('Cannot create unsigned error message. Must authenticate with "privateKey" or "provider"')
                done()
            })
        })

        it('creates correct group key response', async () => {
            const signer = {
                signStreamMessage: (streamMessage) => {
                    /* eslint-disable no-param-reassign */
                    streamMessage.signatureType = StreamMessage.SIGNATURE_TYPES.ETH
                    streamMessage.signature = 'signature'
                    /* eslint-enable no-param-reassign */
                    return Promise.resolve()
                },
            }

            const util = new MessageCreationUtil(auth, signer, () => Promise.resolve({
                username: 'username',
            }), sinon.stub().resolves(stream))

            const requestId = uniqueId('requestId')
            const streamMessage = await util.createErrorMessage({
                keyExchangeStreamId: 'keyExchangeStreamId',
                error: new InvalidGroupKeyRequestError('invalid'),
                streamId: stream.id,
                requestId,
            })

            expect(streamMessage.getStreamId()).toBe('keyExchangeStreamId') // sending to subscriber's keyexchange stream

            const content = streamMessage.getParsedContent()
            expect(streamMessage.messageType).toBe(StreamMessage.MESSAGE_TYPES.GROUP_KEY_ERROR_RESPONSE)
            expect(streamMessage.encryptionType).toBe(StreamMessage.ENCRYPTION_TYPES.NONE)
            expect(content.code).toBe('INVALID_GROUP_KEY_REQUEST')
            expect(content.requestId).toBe(requestId)
            expect(content.streamId).toBe(stream.id)
            expect(content.message).toBe('invalid')
            expect(streamMessage.signature).toBeTruthy()
        })
    })
})

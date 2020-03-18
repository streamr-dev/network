import crypto from 'crypto'
import assert from 'assert'

import sinon from 'sinon'
import { ethers } from 'ethers'
import { MessageLayer } from 'streamr-client-protocol'

import MessageCreationUtil from '../../src/MessageCreationUtil'
import Stream from '../../src/rest/domain/Stream'
import KeyStorageUtil from '../../src/KeyStorageUtil'
import InvalidGroupKeyRequestError from '../../src/errors/InvalidGroupKeyRequestError'

const { StreamMessage } = MessageLayer

describe('MessageCreationUtil', () => {
    const hashedUsername = '0x16F78A7D6317F102BBD95FC9A4F3FF2E3249287690B8BDAD6B7810F82B34ACE3'.toLowerCase()
    describe('getPublisherId', () => {
        it('use address', async () => {
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
            const msgCreationUtil = new MessageCreationUtil(client.options.auth, undefined, client.getUserInfo())
            const publisherId = await msgCreationUtil.getPublisherId()
            assert.strictEqual(publisherId, wallet.address.toLowerCase())
        })
        it('use hash of username', async () => {
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
            const msgCreationUtil = new MessageCreationUtil(client.options.auth, undefined, client.getUserInfo())
            const publisherId = await msgCreationUtil.getPublisherId()
            assert.strictEqual(publisherId, hashedUsername)
        })
        it('use hash of username', async () => {
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
            const msgCreationUtil = new MessageCreationUtil(client.options.auth, undefined, client.getUserInfo())
            const publisherId = await msgCreationUtil.getPublisherId()
            assert.strictEqual(publisherId, hashedUsername)
        })
        it('use hash of username', async () => {
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
            const msgCreationUtil = new MessageCreationUtil(client.options.auth, undefined, client.getUserInfo())
            const publisherId = await msgCreationUtil.getPublisherId()
            assert.strictEqual(publisherId, hashedUsername)
        })
    })

    describe('partitioner', () => {
        it('should throw if partition count is not defined', () => {
            assert.throws(() => {
                new MessageCreationUtil().computeStreamPartition(undefined, 'foo')
            })
        })

        it('should always return partition 0 for all keys if partition count is 1', () => {
            for (let i = 0; i < 100; i++) {
                assert.equal(new MessageCreationUtil().computeStreamPartition(1, `foo${i}`), 0)
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

            assert.equal(correctResults.length, keys.length, 'key array and result array are different size!')

            for (let i = 0; i < keys.length; i++) {
                const partition = new MessageCreationUtil().computeStreamPartition(10, keys[i])
                assert.equal(
                    correctResults[i], partition,
                    `Partition is incorrect for key: ${keys[i]}. Was: ${partition}, should be: ${correctResults[i]}`,
                )
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
            return StreamMessage.create(
                [streamId, 0, timestamp, sequenceNumber, hashedUsername, msgCreationUtil.msgChainId], prevMsgRef,
                StreamMessage.CONTENT_TYPES.MESSAGE, StreamMessage.ENCRYPTION_TYPES.NONE, pubMsg, StreamMessage.SIGNATURE_TYPES.ETH, 'signature',
            )
        }

        it('should create messages with increasing sequence numbers', (done) => {
            const ts = Date.now()
            const promises = []
            let prevMsgRef = null
            for (let i = 0; i < 10; i++) {
                /* eslint-disable no-loop-func */
                promises.push(msgCreationUtil.createStreamMessage(stream, pubMsg, ts).then((streamMessage) => {
                    assert.deepStrictEqual(streamMessage, getStreamMessage('streamId', ts, i, prevMsgRef))
                    prevMsgRef = [ts, i]
                }))
                /* eslint-enable no-loop-func */
            }
            Promise.all(promises).then(() => {
                done()
            })
        })

        it('should create messages with sequence number 0', (done) => {
            const ts = Date.now()
            const promises = []
            let prevMsgRef = null
            for (let i = 0; i < 10; i++) {
                /* eslint-disable no-loop-func */
                promises.push(msgCreationUtil.createStreamMessage(stream, pubMsg, ts + i).then((streamMessage) => {
                    assert.deepStrictEqual(streamMessage, getStreamMessage('streamId', ts + i, 0, prevMsgRef))
                    prevMsgRef = [ts + i, 0]
                }))
                /* eslint-enable no-loop-func */
            }
            Promise.all(promises).then(() => {
                done()
            })
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
            assert.deepStrictEqual(msg1, getStreamMessage('streamId', ts, 0, null))
            assert.deepStrictEqual(msg2, getStreamMessage('streamId2', ts, 0, null))
            assert.deepStrictEqual(msg3, getStreamMessage('streamId3', ts, 0, null))
        })

        it('should sign messages if signer is defined', async () => {
            const msg1 = await msgCreationUtil.createStreamMessage(stream, pubMsg, Date.now())
            assert.strictEqual(msg1.signature, 'signature')
        })

        it('should create message from a stream id by fetching the stream', async () => {
            const ts = Date.now()
            const streamMessage = await msgCreationUtil.createStreamMessage(stream.id, pubMsg, ts)
            assert.deepStrictEqual(streamMessage, getStreamMessage(stream.id, ts, 0, null))
        })
    })

    describe('encryption', () => {
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
            assert.strictEqual(msg.encryptionType, StreamMessage.ENCRYPTION_TYPES.NONE)
            assert.deepStrictEqual(msg.getParsedContent(), pubMsg)
        })
        it('should create encrypted messages when key defined in constructor', async () => {
            const key = crypto.randomBytes(32)
            const keyStorageUtil = KeyStorageUtil.getKeyStorageUtil()
            keyStorageUtil.addKey(stream.id, key)

            const msgCreationUtil = new MessageCreationUtil(
                client.options.auth, client.signer, client.getUserInfo(), client.getStream, keyStorageUtil,
            )
            const msg = await msgCreationUtil.createStreamMessage(stream, pubMsg, Date.now())
            assert.strictEqual(msg.encryptionType, StreamMessage.ENCRYPTION_TYPES.AES)
            assert.strictEqual(msg.getSerializedContent().length, 58) // 16*2 + 13*2 (hex string made of IV + msg of 13 chars)
        })
        it('should throw when using a key with a size smaller than 256 bits', (done) => {
            const key = crypto.randomBytes(16)
            const msgCreationUtil = new MessageCreationUtil(client.options.auth, client.signer, client.getUserInfo(), client.getStream)
            msgCreationUtil.createStreamMessage(stream, pubMsg, Date.now(), null, key).catch((err) => {
                assert.strictEqual(err.toString(), 'Error: Group key must have a size of 256 bits, not 128')
                done()
            })
        })
        it('should create encrypted messages when key defined in createStreamMessage() and use the same key later', async () => {
            const key = crypto.randomBytes(32)
            const msgCreationUtil = new MessageCreationUtil(client.options.auth, client.signer, client.getUserInfo(), client.getStream)
            const msg1 = await msgCreationUtil.createStreamMessage(stream, pubMsg, Date.now(), null, key)
            assert.strictEqual(msg1.encryptionType, StreamMessage.ENCRYPTION_TYPES.AES)
            assert.strictEqual(msg1.getSerializedContent().length, 58)
            const msg2 = await msgCreationUtil.createStreamMessage(stream, pubMsg, Date.now())
            assert.strictEqual(msg2.encryptionType, StreamMessage.ENCRYPTION_TYPES.AES)
            assert.strictEqual(msg2.getSerializedContent().length, 58)
            // should use different IVs
            assert.notDeepStrictEqual(msg1.getSerializedContent().slice(0, 32), msg2.getSerializedContent().slice(0, 32))
            // should produce different ciphertexts even if same plaintexts and same key
            assert.notDeepStrictEqual(msg1.getSerializedContent().slice(32), msg2.getSerializedContent().slice(32))
        })
        it('should update the key when redefined', async () => {
            const key1 = crypto.randomBytes(32)
            const key2 = crypto.randomBytes(32)
            const msgCreationUtil = new MessageCreationUtil(client.options.auth, client.signer, client.getUserInfo(), client.getStream)
            const msg1 = await msgCreationUtil.createStreamMessage(stream, pubMsg, Date.now(), null, key1)
            assert.strictEqual(msg1.encryptionType, StreamMessage.ENCRYPTION_TYPES.AES)
            assert.strictEqual(msg1.getSerializedContent().length, 58)
            const msg2 = await msgCreationUtil.createStreamMessage(stream, pubMsg, Date.now(), null, key2)
            assert.strictEqual(msg2.encryptionType, StreamMessage.ENCRYPTION_TYPES.NEW_KEY_AND_AES)
            assert.strictEqual(msg2.getSerializedContent().length, 122)// 16*2 + 32*2 + 13*2 (IV + key of 32 bytes + msg of 13 chars)
        })
    })

    describe('createGroupKeyRequest', () => {
        const stream = new Stream(null, {
            id: 'streamId',
            partitions: 1,
        })
        const auth = {
            username: 'username',
        }
        it('should not be able to create unsigned group key request', (done) => {
            const util = new MessageCreationUtil(auth, null, () => Promise.resolve({
                username: 'username',
            }), sinon.stub().resolves(stream))
            util.createGroupKeyRequest('publisherId', 'streamId', 'rsaPublicKey', 1354155, 2344155).catch((err) => {
                assert.strictEqual(err.message, 'Cannot create unsigned group key request. Must authenticate with "privateKey" or "provider"')
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
            const streamMessage = await util.createGroupKeyRequest('publisherId', 'streamId', 'rsaPublicKey', 1354155, 2344155)
            assert.strictEqual(streamMessage.getStreamId(), 'publisherId'.toLowerCase()) // sending to publisher's inbox stream
            const content = streamMessage.getParsedContent()
            assert.strictEqual(streamMessage.contentType, StreamMessage.CONTENT_TYPES.GROUP_KEY_REQUEST)
            assert.strictEqual(streamMessage.encryptionType, StreamMessage.ENCRYPTION_TYPES.NONE)
            assert.strictEqual(content.streamId, 'streamId')
            assert.strictEqual(content.publicKey, 'rsaPublicKey')
            assert.strictEqual(content.range.start, 1354155)
            assert.strictEqual(content.range.end, 2344155)
            assert(streamMessage.signature)
        })
    })

    describe('createGroupKeyResponse', () => {
        const stream = new Stream(null, {
            id: 'streamId',
            partitions: 1,
        })
        const auth = {
            username: 'username',
        }
        it('should not be able to create unsigned group key response', (done) => {
            const util = new MessageCreationUtil(auth, null, () => Promise.resolve({
                username: 'username',
            }), sinon.stub().resolves(stream))
            util.createGroupKeyResponse('subscriberId', 'streamId', [{
                groupKey: 'group-key',
                start: 34524,
            }]).catch((err) => {
                assert.strictEqual(err.message, 'Cannot create unsigned group key response. Must authenticate with "privateKey" or "provider"')
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
            const streamMessage = await util.createGroupKeyResponse('subscriberId', 'streamId', [{
                groupKey: 'encrypted-group-key',
                start: 34524,
            }])
            assert.strictEqual(streamMessage.getStreamId(), 'subscriberId'.toLowerCase()) // sending to subscriber's inbox stream
            const content = streamMessage.getParsedContent()
            assert.strictEqual(streamMessage.contentType, StreamMessage.CONTENT_TYPES.GROUP_KEY_RESPONSE_SIMPLE)
            assert.strictEqual(streamMessage.encryptionType, StreamMessage.ENCRYPTION_TYPES.RSA)
            assert.strictEqual(content.streamId, 'streamId')
            assert.deepStrictEqual(content.keys, [{
                groupKey: 'encrypted-group-key',
                start: 34524,
            }])
            assert(streamMessage.signature)
        })
    })

    describe('createErrorMessage', () => {
        const stream = new Stream(null, {
            id: 'streamId',
            partitions: 1,
        })
        const auth = {
            username: 'username',
        }
        it('should not be able to create unsigned error message', (done) => {
            const util = new MessageCreationUtil(auth, null, () => Promise.resolve({
                username: 'username',
            }), sinon.stub().resolves(stream))
            util.createErrorMessage('destinationAddress', new Error()).catch((err) => {
                assert.strictEqual(err.message, 'Cannot create unsigned error message. Must authenticate with "privateKey" or "provider"')
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
            const streamMessage = await util.createErrorMessage('destinationAddress', new InvalidGroupKeyRequestError('invalid'))
            assert.strictEqual(streamMessage.getStreamId(), 'destinationAddress'.toLowerCase()) // sending to subscriber's inbox stream
            const content = streamMessage.getParsedContent()
            assert.strictEqual(streamMessage.contentType, StreamMessage.CONTENT_TYPES.ERROR_MSG)
            assert.strictEqual(streamMessage.encryptionType, StreamMessage.ENCRYPTION_TYPES.NONE)
            assert.strictEqual(content.code, 'INVALID_GROUP_KEY_REQUEST')
            assert.deepStrictEqual(content.message, 'invalid')
            assert(streamMessage.signature)
        })
    })
})

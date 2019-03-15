import assert from 'assert'
import sinon from 'sinon'
import Web3 from 'web3'
import { MessageLayer } from 'streamr-client-protocol'
import FakeProvider from 'web3-fake-provider'
import MessageCreationUtil from '../../src/MessageCreationUtil'

const { StreamMessage } = MessageLayer

describe('MessageCreationUtil', () => {
    const hashedUsername = '16F78A7D6317F102BBD95FC9A4F3FF2E3249287690B8BDAD6B7810F82B34ACE3'.toLowerCase()
    describe('getPublisherId', () => {
        it('use address', async () => {
            const account = new Web3(new FakeProvider()).eth.accounts.create()
            const client = {
                options: {
                    auth: {
                        privateKey: account.privateKey,
                    },
                },
                getUserInfo: sinon.stub().resolves({
                    username: 'username',
                }),
            }
            const msgCreationUtil = new MessageCreationUtil(client.options.auth, undefined, client.getUserInfo())
            const publisherId = await msgCreationUtil.getPublisherId()
            assert.strictEqual(publisherId, account.address)
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
                MessageCreationUtil.computeStreamPartition(undefined, 'foo')
            })
        })

        it('should always return partition 0 for all keys if partition count is 1', () => {
            for (let i = 0; i < 100; i++) {
                assert.equal(MessageCreationUtil.computeStreamPartition(1, `foo${i}`), 0)
            }
        })

        it('should use murmur2 partitioner and produce same results as org.apache.kafka.common.utils.Utils.murmur2(byte[])', () => {
            const keys = []
            for (let i = 0; i < 100; i++) {
                keys.push(`key-${i}`)
            }
            // Results must be the same as those produced by StreamService#partition()
            const correctResults = [5, 6, 3, 9, 3, 0, 2, 8, 2, 6, 9, 5, 5, 8, 5, 0, 0, 7, 2, 8, 5, 6,
                8, 1, 7, 9, 2, 1, 8, 5, 6, 4, 3, 3, 1, 7, 1, 5, 2, 8, 3, 3, 8, 6, 8, 7, 4, 8, 2, 3, 5,
                2, 8, 8, 8, 9, 8, 2, 7, 7, 0, 8, 8, 5, 9, 9, 9, 7, 2, 7, 0, 4, 4, 6, 4, 8, 5, 5, 0, 8,
                2, 5, 1, 8, 6, 8, 8, 1, 2, 0, 7, 3, 2, 2, 5, 7, 9, 6, 4, 7]

            assert.equal(correctResults.length, keys.length, 'key array and result array are different size!')

            for (let i = 0; i < keys.length; i++) {
                const partition = MessageCreationUtil.computeStreamPartition(10, keys[i])
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

        const stream = {
            id: 'streamId',
            partitions: 1,
        }
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
            }
            msgCreationUtil = new MessageCreationUtil(client.options.auth, client.signer, client.getUserInfo())
        })

        function getStreamMessage(streamId, timestamp, sequenceNumber, prevMsgRef) {
            return StreamMessage.create(
                [streamId, 0, timestamp, sequenceNumber, hashedUsername, msgCreationUtil.msgChainId], prevMsgRef,
                StreamMessage.CONTENT_TYPES.JSON, pubMsg, StreamMessage.SIGNATURE_TYPES.ETH, 'signature',
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
            const stream2 = {
                id: 'streamId2',
                partitions: 1,
            }
            const stream3 = {
                id: 'streamId3',
                partitions: 1,
            }
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
    })
})

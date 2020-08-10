import sinon from 'sinon'
import { ethers } from 'ethers'
import { MessageLayer } from 'streamr-client-protocol'

import MessageCreationUtil from '../../src/MessageCreationUtil'
import Stream from '../../src/rest/domain/Stream'

const { StreamMessage, MessageID, MessageRef } = MessageLayer

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
})

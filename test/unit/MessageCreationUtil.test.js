import sinon from 'sinon'
import { ethers } from 'ethers'
import { wait } from 'streamr-test-utils'
import { MessageLayer } from 'streamr-client-protocol'

import { MessageCreationUtil, StreamPartitioner } from '../../src/Publisher'
import Stream from '../../src/rest/domain/Stream'

// eslint-disable-next-line import/no-named-as-default-member
import StubbedStreamrClient from './StubbedStreamrClient'

const { StreamMessage, MessageID, MessageRef } = MessageLayer

describe('MessageCreationUtil', () => {
    let client
    let msgCreationUtil
    const hashedUsername = '0x16F78A7D6317F102BBD95FC9A4F3FF2E3249287690B8BDAD6B7810F82B34ACE3'.toLowerCase()

    const createClient = (opts = {}) => {
        return new StubbedStreamrClient({
            auth: {
                username: 'username',
            },
            autoConnect: false,
            autoDisconnect: false,
            maxRetries: 2,
            ...opts,
        })
    }

    afterEach(async () => {
        if (msgCreationUtil) {
            msgCreationUtil.stop()
        }

        if (client) {
            await client.disconnect()
        }
    })

    describe('getPublisherId', () => {
        it('uses address for privateKey auth', async () => {
            const wallet = ethers.Wallet.createRandom()
            client = createClient({
                auth: {
                    privateKey: wallet.privateKey,
                },
            })
            msgCreationUtil = new MessageCreationUtil(client)
            const publisherId = await msgCreationUtil.getPublisherId()
            expect(publisherId).toBe(wallet.address.toLowerCase())
        })

        it('uses hash of username for apiKey auth', async () => {
            client = createClient({
                auth: {
                    apiKey: 'apiKey',
                },
            })
            msgCreationUtil = new MessageCreationUtil(client)
            const publisherId = await msgCreationUtil.getPublisherId()
            expect(publisherId).toBe(hashedUsername)
        })

        it('uses hash of username for username auth', async () => {
            client = createClient({
                auth: {
                    username: 'username',
                },
            })
            msgCreationUtil = new MessageCreationUtil(client)
            const publisherId = await msgCreationUtil.getPublisherId()
            expect(publisherId).toBe(hashedUsername)
        })

        it('uses hash of username for sessionToken auth', async () => {
            client = createClient({
                auth: {
                    sessionToken: 'session-token',
                },
            })
            msgCreationUtil = new MessageCreationUtil(client)
            const publisherId = await msgCreationUtil.getPublisherId()
            expect(publisherId).toBe(hashedUsername)
        })
    })

    describe('StreamPartitioner', () => {
        let streamPartitioner

        beforeAll(() => {
            client = createClient()
        })

        beforeEach(() => {
            streamPartitioner = new StreamPartitioner(client)
        })

        it('should throw if partition count is not defined', () => {
            expect(() => {
                streamPartitioner.computeStreamPartition(undefined, 'foo')
            }).toThrow()
        })

        it('should always return partition 0 for all keys if partition count is 1', () => {
            for (let i = 0; i < 100; i++) {
                expect(streamPartitioner.computeStreamPartition(1, `foo${i}`)).toEqual(0)
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
                const partition = streamPartitioner.computeStreamPartition(10, keys[i])
                expect(correctResults[i]).toStrictEqual(partition)
            }
        })
    })

    describe('createStreamMessage()', () => {
        const pubMsg = {
            foo: 'bar',
        }

        let stream

        beforeAll(() => {
            client = createClient({
                auth: {
                    username: 'username',
                },
            })
        })

        beforeEach(() => {
            stream = new Stream(null, {
                id: 'streamId',
                partitions: 1,
            })
            client.getStream = sinon.stub().resolves(stream)
            msgCreationUtil = new MessageCreationUtil(client)
        })

        function getStreamMessage(streamId, timestamp, sequenceNumber, prevMsgRef) {
            return new StreamMessage({
                messageId: new MessageID(streamId, 0, timestamp, sequenceNumber, hashedUsername, msgCreationUtil.msgChainer.msgChainId),
                prevMsgRef,
                content: pubMsg,
                messageType: StreamMessage.MESSAGE_TYPES.MESSAGE,
                encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
            })
        }

        it('should create messages with increasing sequence numbers', async () => {
            const ts = Date.now()
            let prevMsgRef = null
            for (let i = 0; i < 10; i++) {
                // eslint-disable-next-line no-await-in-loop
                const streamMessage = await msgCreationUtil.createStreamMessage(stream, {
                    content: pubMsg, timestamp: ts,
                })
                expect(streamMessage).toStrictEqual(getStreamMessage('streamId', ts, i, prevMsgRef))
                prevMsgRef = new MessageRef(ts, i)
            }
        })

        it('should create messages with sequence number 0 if different timestamp', async () => {
            const ts = Date.now()
            let prevMsgRef = null
            for (let i = 0; i < 10; i++) {
                // eslint-disable-next-line no-await-in-loop
                const streamMessage = await msgCreationUtil.createStreamMessage(stream, {
                    content: pubMsg, timestamp: ts + i,
                })
                expect(streamMessage).toStrictEqual(getStreamMessage('streamId', ts + i, 0, prevMsgRef))
                prevMsgRef = new MessageRef(ts + i, 0)
            }
        })

        it('should sequence in order even if async dependencies resolve out of order', async () => {
            const ts = Date.now()
            let calls = 0
            const getStreamPartitions = msgCreationUtil.partitioner.getStreamPartitions.bind(msgCreationUtil.partitioner)
            msgCreationUtil.partitioner.getStreamPartitions = async (...args) => {
                calls += 1
                if (calls === 2) {
                    const result = await getStreamPartitions(...args)
                    // delay resolving this call
                    await wait(100)
                    return result
                }
                return getStreamPartitions(...args)
            }

            // simultaneously publish 3 messages, but the second item's dependencies will resolve late.
            // this shouldn't affect the sequencing
            const messages = await Promise.all([
                msgCreationUtil.createStreamMessage(stream, {
                    content: pubMsg, timestamp: ts,
                }),
                msgCreationUtil.createStreamMessage(stream, {
                    content: pubMsg, timestamp: ts,
                }),
                msgCreationUtil.createStreamMessage(stream, {
                    content: pubMsg, timestamp: ts,
                })
            ])
            const sequenceNumbers = messages.map((m) => m.getSequenceNumber())
            expect(sequenceNumbers).toEqual([0, 1, 2])
        })

        it('should handle old timestamps', async () => {
            const ts = Date.now()
            const streamMessage1 = await msgCreationUtil.createStreamMessage(stream, {
                content: pubMsg, timestamp: ts,
            })
            const streamMessage2 = await msgCreationUtil.createStreamMessage(stream, {
                content: pubMsg, timestamp: ts + 1,
            })
            const streamMessage3 = await msgCreationUtil.createStreamMessage(stream, {
                content: pubMsg, timestamp: ts,
            })
            const sequenceNumbers = [streamMessage1, streamMessage2, streamMessage3].map((m) => m.getSequenceNumber())
            expect(sequenceNumbers).toEqual([0, 0, 1])
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

            const msg1 = await msgCreationUtil.createStreamMessage(stream, {
                content: pubMsg, timestamp: ts
            })
            const msg2 = await msgCreationUtil.createStreamMessage(stream2, {
                content: pubMsg, timestamp: ts
            })
            const msg3 = await msgCreationUtil.createStreamMessage(stream3, {
                content: pubMsg, timestamp: ts
            })

            expect(msg1).toEqual(getStreamMessage('streamId', ts, 0, null))
            expect(msg2).toEqual(getStreamMessage('streamId2', ts, 0, null))
            expect(msg3).toEqual(getStreamMessage('streamId3', ts, 0, null))
        })

        it.skip('should sign messages if signer is defined', async () => {
            const msg1 = await msgCreationUtil.createStreamMessage(stream, {
                content: pubMsg, timestamp: Date.now()
            })
            expect(msg1.signature).toBe('signature')
        })

        it('should create message from a stream id by fetching the stream', async () => {
            const ts = Date.now()
            const streamMessage = await msgCreationUtil.createStreamMessage(stream.id, {
                content: pubMsg, timestamp: ts
            })
            expect(streamMessage).toEqual(getStreamMessage(stream.id, ts, 0, null))
        })
    })
})

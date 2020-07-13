import crypto from 'crypto'

import sinon from 'sinon'
import { ControlLayer, MessageLayer, Errors } from 'streamr-client-protocol'

import RealTimeSubscription from '../../src/RealTimeSubscription'
import EncryptionUtil from '../../src/EncryptionUtil'
import Subscription from '../../src/Subscription'
import AbstractSubscription from '../../src/AbstractSubscription'

const { StreamMessage, MessageIDStrict, MessageRef } = MessageLayer

const createMsg = (
    timestamp = 1, sequenceNumber = 0, prevTimestamp = null,
    prevSequenceNumber = 0, content = {}, publisherId = 'publisherId', msgChainId = '1',
    encryptionType = StreamMessage.ENCRYPTION_TYPES.NONE,
) => {
    const prevMsgRef = prevTimestamp ? new MessageRef(prevTimestamp, prevSequenceNumber) : null
    return new StreamMessage({
        messageId: new MessageIDStrict('streamId', 0, timestamp, sequenceNumber, publisherId, msgChainId),
        prevMsgRef,
        content,
        contentType: StreamMessage.CONTENT_TYPES.MESSAGE,
        encryptionType,
        signatureType: StreamMessage.SIGNATURE_TYPES.NONE,
        signature: '',
    })
}

const msg = createMsg()

describe('RealTimeSubscription', () => {
    describe('message handling', () => {
        describe('handleBroadcastMessage()', () => {
            it('calls the message handler', async (done) => {
                const handler = jest.fn(async () => true)

                const sub = new RealTimeSubscription(msg.getStreamId(), msg.getStreamPartition(), (content, receivedMsg) => {
                    expect(content).toStrictEqual(msg.getParsedContent())
                    expect(msg).toStrictEqual(receivedMsg)
                    expect(handler).toHaveBeenCalledTimes(1)
                    done()
                })
                await sub.handleBroadcastMessage(msg, handler)
            })

            describe('on error', () => {
                let sub

                beforeEach(() => {
                    sub = new RealTimeSubscription(msg.getStreamId(), msg.getStreamPartition(), () => { throw new Error('should not be called!') })
                    sub.onError = jest.fn()
                })

                afterEach(() => {
                    sub.stop()
                })

                describe('when message verification throws', () => {
                    it('emits an error event', async (done) => {
                        const error = new Error('test error')
                        sub.once('error', (err) => {
                            expect(err).toBe(error)
                            done()
                        })
                        await sub.handleBroadcastMessage(msg, () => { throw error })
                    })
                })

                describe('when message handler throws', () => {
                    it('emits an error event', async (done) => {
                        sub.once('error', (err) => {
                            expect(err.message).toBe('should not be called!')
                            expect(sub.onError).toHaveBeenCalled()
                            done()
                        })
                        await sub.handleBroadcastMessage(msg, async () => true)
                    })

                    it('prints to standard error stream', async (done) => {
                        sub.once('error', (err) => {
                            expect(err.message).toBe('should not be called!')
                            expect(sub.onError).toHaveBeenCalled()
                            done()
                        })
                        await sub.handleBroadcastMessage(msg, async () => true)
                    })
                })
            })

            it('calls the callback once for each message in order', async (done) => {
                const msgs = [1, 2, 3, 4, 5].map((timestamp) => createMsg(
                    timestamp,
                    timestamp === 1 ? 0 : timestamp - 1,
                ))

                const received = []

                const sub = new RealTimeSubscription(msg.getStreamId(), msg.getStreamPartition(), (content, receivedMsg) => {
                    received.push(receivedMsg)
                    if (received.length === 5) {
                        expect(msgs).toStrictEqual(received)
                        done()
                    }
                })

                await Promise.all(msgs.map((m) => sub.handleBroadcastMessage(m, async () => true)))
            })
        })

        describe('handleResentMessage()', () => {
            it('processes messages if resending is true', async () => {
                const handler = jest.fn()
                const sub = new RealTimeSubscription(msg.getStreamId(), msg.getStreamPartition(), handler)

                sub.setResending(true)
                await sub.handleResentMessage(msg, 'requestId', async () => true)
                expect(handler).toHaveBeenCalledTimes(1)
            })

            describe('on error', () => {
                let sub

                beforeEach(() => {
                    sub = new RealTimeSubscription(msg.getStreamId(), msg.getStreamPartition(), () => {
                        throw new Error('should not be called!')
                    })
                    sub.setResending(true)
                })

                afterEach(() => {
                    sub.stop()
                })

                describe('when message verification throws', () => {
                    it('emits an error event', async (done) => {
                        const error = new Error('test error')
                        sub.onError = jest.fn()
                        sub.once('error', (err) => {
                            expect(err).toBe(error)
                            expect(sub.onError).toHaveBeenCalled()
                            done()
                        })
                        return sub.handleResentMessage(msg, 'requestId', () => { throw error })
                    })
                })

                describe('when message handler throws', () => {
                    it('emits an error event', async (done) => {
                        sub.onError = jest.fn()
                        sub.once('error', (err) => {
                            expect(err.message).toBe('should not be called!')
                            expect(sub.onError).toHaveBeenCalled()
                            done()
                        })
                        await sub.handleResentMessage(msg, 'requestId', async () => true)
                    })

                    it('prints to standard error stream', async (done) => {
                        sub.onError = jest.fn()
                        sub.once('error', (err) => {
                            expect(err.message).toBe('should not be called!')
                            expect(sub.onError).toHaveBeenCalled()
                            done()
                        })
                        return sub.handleResentMessage(msg, 'requestId', async () => true)
                    })
                })
            })
        })

        describe('duplicate handling', () => {
            it('ignores re-received messages', async () => {
                const handler = jest.fn()
                const sub = new RealTimeSubscription(msg.getStreamId(), msg.getStreamPartition(), handler)

                await sub.handleBroadcastMessage(msg, async () => true)
                await sub.handleBroadcastMessage(msg, async () => true)
                expect(handler).toHaveBeenCalledTimes(1)
                sub.stop()
            })

            it('ignores re-received messages if they come from resend', async () => {
                const handler = jest.fn()
                const sub = new RealTimeSubscription(msg.getStreamId(), msg.getStreamPartition(), handler)
                sub.setResending(true)

                await sub.handleBroadcastMessage(msg, async () => true)
                await sub.handleResentMessage(msg, 'requestId', async () => true)
                sub.stop()
            })
        })

        describe('gap detection', () => {
            it('emits "gap" if a gap is detected', (done) => {
                const msg1 = msg
                const msg4 = createMsg(4, undefined, 3)

                const sub = new RealTimeSubscription(msg.getStreamId(), msg.getStreamPartition(), () => {}, {}, 100, 100)
                sub.once('gap', (from, to, publisherId) => {
                    expect(from.timestamp).toEqual(1) // cannot know the first missing message so there will be a duplicate received
                    expect(from.sequenceNumber).toEqual(1)
                    expect(to.timestamp).toEqual(3)
                    expect(to.sequenceNumber).toEqual(0)
                    expect(publisherId).toEqual('publisherId')
                    setTimeout(() => {
                        sub.stop()
                        done()
                    }, 100)
                })

                sub.handleBroadcastMessage(msg1, async () => true)
                sub.handleBroadcastMessage(msg4, async () => true)
            })

            it('emits second "gap" after the first one if no missing message is received in between', (done) => {
                const msg1 = msg
                const msg4 = createMsg(4, undefined, 3)

                const sub = new RealTimeSubscription(msg.getStreamId(), msg.getStreamPartition(), () => {}, {}, 100, 100)
                sub.once('gap', (from, to, publisherId) => {
                    sub.once('gap', (from2, to2, publisherId2) => {
                        expect(from).toStrictEqual(from2)
                        expect(to).toStrictEqual(to2)
                        expect(publisherId).toStrictEqual(publisherId2)
                        sub.stop()
                        done()
                    })
                })

                sub.handleBroadcastMessage(msg1, async () => true)
                sub.handleBroadcastMessage(msg4, async () => true)
            })

            it('does not emit second "gap" after the first one if the missing messages are received in between', (done) => {
                const msg1 = msg
                const msg2 = createMsg(2, undefined, 1)
                const msg3 = createMsg(3, undefined, 2)
                const msg4 = createMsg(4, undefined, 3)

                const sub = new RealTimeSubscription(msg.getStreamId(), msg.getStreamPartition(), () => {}, {}, 100, 100)
                sub.once('gap', () => {
                    sub.handleBroadcastMessage(msg2, async () => true)
                    sub.handleBroadcastMessage(msg3, async () => true)
                    sub.once('gap', () => { throw new Error('should not emit second gap') })
                    setTimeout(() => {
                        sub.stop()
                        done()
                    }, 100 + 1000)
                })

                sub.handleBroadcastMessage(msg1, async () => true)
                sub.handleBroadcastMessage(msg4, async () => true)
            })

            it('does not emit second "gap" if gets unsubscribed', async (done) => {
                const msg1 = msg
                const msg4 = createMsg(4, undefined, 3)

                const sub = new RealTimeSubscription(msg.getStreamId(), msg.getStreamPartition(), () => {}, {}, 100, 100)
                sub.once('gap', () => {
                    sub.emit('unsubscribed')
                    sub.once('gap', () => { throw new Error('should not emit second gap') })
                    setTimeout(() => {
                        sub.stop()
                        done()
                    }, 100 + 1000)
                })

                sub.handleBroadcastMessage(msg1, async () => true)
                sub.handleBroadcastMessage(msg4, async () => true)
            })

            it('does not emit second "gap" if gets disconnected', async (done) => {
                const msg1 = msg
                const msg4 = createMsg(4, undefined, 3)

                const sub = new RealTimeSubscription(msg.getStreamId(), msg.getStreamPartition(), () => {}, {}, 100, 100)
                sub.once('gap', () => {
                    sub.emit('disconnected')
                    sub.once('gap', () => { throw new Error('should not emit second gap') })
                    setTimeout(() => {
                        sub.stop()
                        done()
                    }, 100 + 1000)
                })

                sub.handleBroadcastMessage(msg1, async () => true)
                sub.handleBroadcastMessage(msg4, async () => true)
            })

            it('does not emit "gap" if different publishers', () => {
                const msg1 = msg
                const msg1b = createMsg(1, 0, undefined, 0, {}, 'anotherPublisherId')

                const sub = new RealTimeSubscription(msg.getStreamId(), msg.getStreamPartition(), () => {})
                sub.once('gap', () => {
                    throw new Error('unexpected gap')
                })

                sub.handleBroadcastMessage(msg1, async () => true)
                sub.handleBroadcastMessage(msg1b, async () => true)
            })

            it('emits "gap" if a gap is detected (same timestamp but different sequenceNumbers)', (done) => {
                const msg1 = msg
                const msg4 = createMsg(1, 4, 1, 3)

                const sub = new RealTimeSubscription(msg.getStreamId(), msg.getStreamPartition(), () => {}, {}, 100, 100)
                sub.once('gap', (from, to, publisherId) => {
                    expect(from.timestamp).toEqual(1) // cannot know the first missing message so there will be a duplicate received
                    expect(from.sequenceNumber).toEqual(1)
                    expect(to.timestamp).toEqual(1)
                    expect(to.sequenceNumber).toEqual(3)
                    expect(publisherId).toEqual('publisherId')
                    setTimeout(() => {
                        sub.stop()
                        done()
                    }, 100)
                })

                sub.handleBroadcastMessage(msg1, async () => true)
                sub.handleBroadcastMessage(msg4, async () => true)
            })

            it('does not emit "gap" if a gap is not detected', () => {
                const msg1 = msg
                const msg2 = createMsg(2, undefined, 1)

                const sub = new RealTimeSubscription(msg.getStreamId(), msg.getStreamPartition(), () => {})
                sub.once('gap', () => { throw new Error() })

                sub.handleBroadcastMessage(msg1, async () => true)
                sub.handleBroadcastMessage(msg2, async () => true)
            })

            it('does not emit "gap" if a gap is not detected (same timestamp but different sequenceNumbers)', () => {
                const msg1 = msg
                const msg2 = createMsg(1, 1, 1, 0)

                const sub = new RealTimeSubscription(msg.getStreamId(), msg.getStreamPartition(), () => {})
                sub.once('gap', () => { throw new Error() })

                sub.handleBroadcastMessage(msg1, async () => true)
                sub.handleBroadcastMessage(msg2, async () => true)
            })
        })

        describe('ordering util', () => {
            it('handles messages in the order in which they arrive if no ordering util', async () => {
                const msg1 = msg
                const msg2 = createMsg(2, 0, 1, 0)
                const msg3 = createMsg(3, 0, 2, 0)
                const msg4 = createMsg(4, 0, 3, 0)
                const received = []

                const sub = new RealTimeSubscription(msg.getStreamId(), msg.getStreamPartition(), (content, receivedMsg) => {
                    received.push(receivedMsg)
                }, {}, 100, 100, false)
                sub.once('gap', () => { throw new Error() })

                await sub.handleBroadcastMessage(msg1, async () => true)
                await sub.handleBroadcastMessage(msg2, async () => true)
                await sub.handleBroadcastMessage(msg4, async () => true)
                await sub.handleBroadcastMessage(msg2, async () => true)
                await sub.handleBroadcastMessage(msg3, async () => true)
                await sub.handleBroadcastMessage(msg1, async () => true)

                expect(received).toStrictEqual([msg1, msg2, msg4, msg2, msg3, msg1])
            })

            it('handles messages in order without duplicates if ordering util is set', async () => {
                const msg1 = msg
                const msg2 = createMsg(2, 0, 1, 0)
                const msg3 = createMsg(3, 0, 2, 0)
                const msg4 = createMsg(4, 0, 3, 0)
                const received = []

                const sub = new RealTimeSubscription(msg.getStreamId(), msg.getStreamPartition(), (content, receivedMsg) => {
                    received.push(receivedMsg)
                })

                await sub.handleBroadcastMessage(msg1, async () => true)
                await sub.handleBroadcastMessage(msg2, async () => true)
                await sub.handleBroadcastMessage(msg4, async () => true)
                await sub.handleBroadcastMessage(msg2, async () => true)
                await sub.handleBroadcastMessage(msg3, async () => true)
                await sub.handleBroadcastMessage(msg1, async () => true)

                expect(received).toStrictEqual([msg1, msg2, msg3, msg4])
            })
        })

        it('emits done after processing a message with the bye key', (done) => {
            const byeMsg = createMsg(1, undefined, null, null, {
                _bye: true,
            })
            const handler = jest.fn()
            const sub = new RealTimeSubscription(byeMsg.getStreamId(), byeMsg.getStreamPartition(), handler)
            sub.once('done', () => {
                expect(handler).toHaveBeenCalledTimes(1)
                done()
            })

            sub.handleBroadcastMessage(byeMsg, async () => true)
        })

        describe('decryption', () => {
            let sub
            afterEach(() => {
                sub.stop()
            })

            it('should read clear text content without trying to decrypt', (done) => {
                const msg1 = createMsg(1, 0, null, 0, {
                    foo: 'bar',
                })
                sub = new RealTimeSubscription(msg1.getStreamId(), msg1.getStreamPartition(), (content) => {
                    expect(content).toStrictEqual(msg1.getParsedContent())
                    done()
                })
                return sub.handleBroadcastMessage(msg1, async () => true)
            })

            it('should decrypt encrypted content with the correct key', (done) => {
                const groupKey = crypto.randomBytes(32)
                const data = {
                    foo: 'bar',
                }
                const msg1 = createMsg(1, 0, null, 0, data)
                EncryptionUtil.encryptStreamMessage(msg1, groupKey)
                sub = new RealTimeSubscription(msg1.getStreamId(), msg1.getStreamPartition(), (content) => {
                    expect(content).toStrictEqual(data)
                    done()
                }, {
                    publisherId: groupKey,
                })
                return sub.handleBroadcastMessage(msg1, async () => true)
            })

            it('should emit "groupKeyMissing" when not able to decrypt with the wrong key', (done) => {
                const correctGroupKey = crypto.randomBytes(32)
                const wrongGroupKey = crypto.randomBytes(32)
                const msg1 = createMsg(1, 0, null, 0, {
                    foo: 'bar',
                })
                EncryptionUtil.encryptStreamMessage(msg1, correctGroupKey)
                sub = new RealTimeSubscription(msg1.getStreamId(), msg1.getStreamPartition(), () => {}, {
                    publisherId: wrongGroupKey,
                })
                sub.once('groupKeyMissing', (publisherId) => {
                    expect(publisherId).toBe(msg1.getPublisherId())
                    done()
                })
                return sub.handleBroadcastMessage(msg1, async () => true)
            })

            it('emits "groupKeyMissing" multiple times before response received', (done) => {
                const correctGroupKey = crypto.randomBytes(32)
                const wrongGroupKey = crypto.randomBytes(32)
                let counter = 0
                const msg1 = createMsg(1, 0, null, 0, {
                    foo: 'bar',
                })
                EncryptionUtil.encryptStreamMessage(msg1, correctGroupKey)
                sub = new RealTimeSubscription(msg1.getStreamId(), msg1.getStreamPartition(), () => {}, {
                    publisherId: wrongGroupKey,
                }, 200)
                sub.on('groupKeyMissing', (publisherId) => {
                    if (counter < 3) {
                        expect(publisherId).toBe(msg1.getPublisherId())
                        counter += 1
                    } else {
                        // fake group key response after 3 requests
                        sub.setGroupKeys(publisherId, [correctGroupKey])
                        setTimeout(() => {
                            if (counter > 3) {
                                throw new Error('Sent additional group key request after response received.')
                            }
                            done()
                        }, 1000)
                    }
                })
                return sub.handleBroadcastMessage(msg1, async () => true)
            })

            it('emits "groupKeyMissing" MAX_NB_GROUP_KEY_REQUESTS times before response received', (done) => {
                const correctGroupKey = crypto.randomBytes(32)
                const wrongGroupKey = crypto.randomBytes(32)
                let counter = 0
                const msg1 = createMsg(1, 0, null, 0, {
                    foo: 'bar',
                })
                const timeout = 200
                EncryptionUtil.encryptStreamMessage(msg1, correctGroupKey)
                sub = new RealTimeSubscription(msg1.getStreamId(), msg1.getStreamPartition(), () => {}, {
                    publisherId: wrongGroupKey,
                }, timeout)
                let t
                sub.on('groupKeyMissing', (publisherId) => {
                    expect(publisherId).toBe(msg1.getPublisherId())
                    counter += 1
                    clearTimeout(t)
                    t = setTimeout(() => {
                        expect(counter).toBe(AbstractSubscription.MAX_NB_GROUP_KEY_REQUESTS)
                        done()
                    }, timeout * (AbstractSubscription.MAX_NB_GROUP_KEY_REQUESTS + 2))
                })
                return sub.handleBroadcastMessage(msg1, async () => true)
            })

            it('should queue messages when not able to decrypt and handle them once the key is updated', async () => {
                const correctGroupKey = crypto.randomBytes(32)
                const wrongGroupKey = crypto.randomBytes(32)
                const data1 = {
                    test: 'data1',
                }
                const data2 = {
                    test: 'data2',
                }
                const msg1 = createMsg(1, 0, null, 0, data1)
                const msg2 = createMsg(2, 0, 1, 0, data2)
                EncryptionUtil.encryptStreamMessage(msg1, correctGroupKey)
                EncryptionUtil.encryptStreamMessage(msg2, correctGroupKey)
                let received1 = null
                let received2 = null
                sub = new RealTimeSubscription(msg1.getStreamId(), msg1.getStreamPartition(), (content) => {
                    if (!received1) {
                        received1 = content
                    } else {
                        received2 = content
                    }
                }, {
                    publisherId: wrongGroupKey,
                })
                // cannot decrypt msg1, queues it and emits "groupKeyMissing" (should send group key request).
                await sub.handleBroadcastMessage(msg1, async () => true)
                // cannot decrypt msg2, queues it.
                await sub.handleBroadcastMessage(msg2, async () => true)
                // faking the reception of the group key response
                sub.setGroupKeys('publisherId', [correctGroupKey])
                // try again to decrypt the queued messages but this time with the correct key
                expect(received1).toStrictEqual(data1)
                expect(received2).toStrictEqual(data2)
            })

            it('should queue messages when not able to decrypt and handle them once the keys are updated (multiple publishers)', async () => {
                const groupKey1 = crypto.randomBytes(32)
                const groupKey2 = crypto.randomBytes(32)
                const wrongGroupKey = crypto.randomBytes(32)
                const data1 = {
                    test: 'data1',
                }
                const data2 = {
                    test: 'data2',
                }
                const data3 = {
                    test: 'data3',
                }
                const data4 = {
                    test: 'data4',
                }
                const msg1 = createMsg(1, 0, null, 0, data1, 'publisherId1')
                const msg2 = createMsg(2, 0, 1, 0, data2, 'publisherId1')
                const msg3 = createMsg(1, 0, null, 0, data3, 'publisherId2')
                const msg4 = createMsg(2, 0, 1, 0, data4, 'publisherId2')
                EncryptionUtil.encryptStreamMessage(msg1, groupKey1)
                EncryptionUtil.encryptStreamMessage(msg2, groupKey1)
                EncryptionUtil.encryptStreamMessage(msg3, groupKey2)
                EncryptionUtil.encryptStreamMessage(msg4, groupKey2)
                const received = []
                sub = new RealTimeSubscription(msg1.getStreamId(), msg1.getStreamPartition(), (content) => {
                    received.push(content)
                }, {
                    publisherId1: wrongGroupKey,
                })
                // cannot decrypt msg1, queues it and emits "groupKeyMissing" (should send group key request).
                await sub.handleBroadcastMessage(msg1, async () => true)
                // cannot decrypt msg2, queues it.
                await sub.handleBroadcastMessage(msg2, async () => true)
                // cannot decrypt msg3, queues it and emits "groupKeyMissing" (should send group key request).
                await sub.handleBroadcastMessage(msg3, async () => true)
                // cannot decrypt msg4, queues it.
                await sub.handleBroadcastMessage(msg4, async () => true)
                // faking the reception of the group key response
                sub.setGroupKeys('publisherId2', [groupKey2])
                sub.setGroupKeys('publisherId1', [groupKey1])
                // try again to decrypt the queued messages but this time with the correct key
                expect(received[0]).toStrictEqual(data3)
                expect(received[1]).toStrictEqual(data4)
                expect(received[2]).toStrictEqual(data1)
                expect(received[3]).toStrictEqual(data2)
            })

            it('should queue messages when cannot decrypt and handle them once the keys are updated (multiple publishers interleaved)', async () => {
                const groupKey1 = crypto.randomBytes(32)
                const groupKey2 = crypto.randomBytes(32)
                const wrongGroupKey = crypto.randomBytes(32)
                const data1 = {
                    test: 'data1',
                }
                const data2 = {
                    test: 'data2',
                }
                const data3 = {
                    test: 'data3',
                }
                const data4 = {
                    test: 'data4',
                }
                const data5 = {
                    test: 'data5',
                }
                const msg1Pub1 = createMsg(1, 0, null, 0, data1, 'publisherId1')
                const msg2Pub1 = createMsg(2, 0, 1, 0, data2, 'publisherId1')
                const msg3Pub1 = createMsg(3, 0, 2, 0, data3, 'publisherId1')
                const msg1Pub2 = createMsg(1, 0, null, 0, data4, 'publisherId2')
                const msg2Pub2 = createMsg(2, 0, 1, 0, data5, 'publisherId2')
                EncryptionUtil.encryptStreamMessage(msg1Pub1, groupKey1)
                EncryptionUtil.encryptStreamMessage(msg2Pub1, groupKey1)
                EncryptionUtil.encryptStreamMessage(msg1Pub2, groupKey2)
                EncryptionUtil.encryptStreamMessage(msg2Pub2, groupKey2)
                const received = []
                sub = new RealTimeSubscription(msg1Pub1.getStreamId(), msg1Pub1.getStreamPartition(), (content) => {
                    received.push(content)
                }, {
                    publisherId1: wrongGroupKey,
                })
                await sub.handleBroadcastMessage(msg1Pub1, async () => true)
                await sub.handleBroadcastMessage(msg1Pub2, async () => true)
                await sub.handleBroadcastMessage(msg2Pub1, async () => true)
                sub.setGroupKeys('publisherId1', [groupKey1])
                await sub.handleBroadcastMessage(msg3Pub1, async () => true)
                await sub.handleBroadcastMessage(msg2Pub2, async () => true)
                sub.setGroupKeys('publisherId2', [groupKey2])

                // try again to decrypt the queued messages but this time with the correct key
                expect(received[0]).toStrictEqual(data1)
                expect(received[1]).toStrictEqual(data2)
                expect(received[2]).toStrictEqual(data3)
                expect(received[3]).toStrictEqual(data4)
                expect(received[4]).toStrictEqual(data5)
            })

            it('should call "onUnableToDecrypt" when not able to decrypt for the second time', async () => {
                const correctGroupKey = crypto.randomBytes(32)
                const wrongGroupKey = crypto.randomBytes(32)
                const otherWrongGroupKey = crypto.randomBytes(32)
                const msg1 = createMsg(1, 0, null, 0, {
                    test: 'data1',
                })
                const msg2 = createMsg(2, 0, 1, 0, {
                    test: 'data2',
                })
                EncryptionUtil.encryptStreamMessage(msg1, correctGroupKey)
                EncryptionUtil.encryptStreamMessage(msg2, correctGroupKey)
                let undecryptableMsg = null
                sub = new RealTimeSubscription(msg1.getStreamId(), msg1.getStreamPartition(), () => {
                    throw new Error('should not call the handler')
                }, {
                    publisherId: wrongGroupKey,
                }, 5000, 5000, true, (error) => {
                    undecryptableMsg = error.streamMessage
                })
                // cannot decrypt msg1, emits "groupKeyMissing" (should send group key request).
                await sub.handleBroadcastMessage(msg1, async () => true)
                // cannot decrypt msg2, queues it.
                await sub.handleBroadcastMessage(msg2, async () => true)
                // faking the reception of the group key response
                sub.setGroupKeys('publisherId', [otherWrongGroupKey])
                expect(undecryptableMsg).toStrictEqual(msg2)
            })

            it('should decrypt first content, update key and decrypt second content', async (done) => {
                const groupKey1 = crypto.randomBytes(32)
                const groupKey2 = crypto.randomBytes(32)
                const data1 = {
                    test: 'data1',
                }
                const data2 = {
                    test: 'data2',
                }
                const msg1 = createMsg(1, 0, null, 0, data1)
                const msg2 = createMsg(2, 0, 1, 0, data2)
                EncryptionUtil.encryptStreamMessageAndNewKey(groupKey2, msg1, groupKey1)
                EncryptionUtil.encryptStreamMessage(msg2, groupKey2)
                let test1Ok = false
                sub = new RealTimeSubscription(msg1.getStreamId(), msg1.getStreamPartition(), (content) => {
                    if (JSON.stringify(content) === JSON.stringify(data1)) {
                        expect(sub.groupKeys[msg1.getPublisherId().toLowerCase()]).toStrictEqual(groupKey2)
                        test1Ok = true
                    } else if (test1Ok && JSON.stringify(content) === JSON.stringify(data2)) {
                        done()
                    }
                }, {
                    publisherId: groupKey1,
                })
                await sub.handleBroadcastMessage(msg1, async () => true)
                return sub.handleBroadcastMessage(msg2, async () => true)
            })
        })
    })

    describe('handleError()', () => {
        it('emits an error event', (done) => {
            const err = new Error('Test error')
            const sub = new RealTimeSubscription(
                msg.getStreamId(),
                msg.getStreamPartition(),
                () => { throw new Error('Msg handler should not be called!') },
            )
            sub.onError = jest.fn()
            sub.once('error', (thrown) => {
                expect(err === thrown).toBeTruthy()
                done()
            })
            sub.handleError(err)
        })

        it('marks the message as received if an InvalidJsonError occurs, and continue normally on next message', async (done) => {
            const sub = new RealTimeSubscription(msg.getStreamId(), msg.getStreamPartition(), (content, receivedMsg) => {
                if (receivedMsg.getTimestamp() === 3) {
                    sub.stop()
                    done()
                }
            })
            sub.onError = jest.fn()

            sub.once('gap', () => { throw new Error('Should not emit gap!') })

            const msg1 = msg
            const msg3 = createMsg(3, undefined, 2)

            // Receive msg1 successfully
            await sub.handleBroadcastMessage(msg1, async () => true)

            // Get notified of an invalid message
            const err = new Errors.InvalidJsonError(msg.getStreamId(), 'invalid json', 'test error msg', createMsg(2, undefined, 1))
            sub.handleError(err)

            // Receive msg3 successfully
            await sub.handleBroadcastMessage(msg3, async () => true)
        })

        it('if an InvalidJsonError AND a gap occur, does not mark it as received and emits gap at the next message', async (done) => {
            const sub = new RealTimeSubscription(msg.getStreamId(), msg.getStreamPartition(), () => {}, {}, 100, 100)
            sub.onError = jest.fn()

            sub.once('gap', (from, to, publisherId) => {
                expect(from.timestamp).toEqual(1) // cannot know the first missing message so there will be a duplicate received
                expect(from.sequenceNumber).toEqual(1)
                expect(to.timestamp).toEqual(3)
                expect(to.sequenceNumber).toEqual(0)
                expect(publisherId).toEqual('publisherId')
                setTimeout(() => {
                    sub.stop()
                    done()
                }, 100)
            })

            const msg1 = msg
            const msg4 = createMsg(4, undefined, 3)

            // Receive msg1 successfully
            await sub.handleBroadcastMessage(msg1, async () => true)

            // Get notified of invalid msg3 (msg2 is missing)
            const err = new Errors.InvalidJsonError(msg.getStreamId(), 'invalid json', 'test error msg', createMsg(3, undefined, 2))
            sub.handleError(err)

            // Receive msg4 and should emit gap
            await sub.handleBroadcastMessage(msg4, async () => true)
        })
    })

    describe('setState()', () => {
        it('updates the state', () => {
            const sub = new RealTimeSubscription(msg.getStreamId(), msg.getStreamPartition(), () => {})
            sub.setState(Subscription.State.subscribed)
            expect(sub.getState()).toEqual(Subscription.State.subscribed)
        })
        it('fires an event', (done) => {
            const sub = new RealTimeSubscription(msg.getStreamId(), msg.getStreamPartition(), () => {})
            sub.once(Subscription.State.subscribed, done)
            sub.setState(Subscription.State.subscribed)
        })
    })

    describe('handleResending()', () => {
        it('emits the resending event', (done) => {
            const sub = new RealTimeSubscription(msg.getStreamId(), msg.getStreamPartition(), () => {})
            sub.addPendingResendRequestId('requestId')
            sub.once('resending', () => done())
            sub.setResending(true)
            sub.handleResending(new ControlLayer.ResendResponseResending({
                streamId: 'streamId',
                streamPartition: 0,
                requestId: 'requestId',
            }))
        })
    })

    describe('handleResent()', () => {
        it('arms the Subscription to emit the resent event on last message (message handler completes BEFORE resent)', async (done) => {
            const handler = jest.fn()
            const sub = new RealTimeSubscription(msg.getStreamId(), msg.getStreamPartition(), handler)
            sub.addPendingResendRequestId('requestId')
            sub.once('resent', () => {
                expect(handler).toHaveBeenCalledTimes(1)
                done()
            })
            sub.setResending(true)
            await sub.handleResentMessage(msg, 'requestId', async () => true)
            sub.handleResent(new ControlLayer.ResendResponseResent({
                streamId: 'streamId',
                streamPartition: 0,
                requestId: 'requestId',
            }))
        })

        it('arms the Subscription to emit the resent event on last message (message handler completes AFTER resent)', async (done) => {
            const handler = jest.fn()
            const sub = new RealTimeSubscription(msg.getStreamId(), msg.getStreamPartition(), handler)
            sub.addPendingResendRequestId('requestId')
            sub.once('resent', () => {
                expect(handler).toHaveBeenCalledTimes(1)
                done()
            })
            sub.setResending(true)
            sub.handleResentMessage(msg, 'requestId', async () => true)
            sub.handleResent(new ControlLayer.ResendResponseResent({
                streamId: 'streamId',
                streamPartition: 0,
                requestId: 'requestId',
            }))
        })

        describe('on error', () => {
            let sub

            afterEach(() => {
                sub.stop()
            })

            it('cleans up the resend if event handler throws', async () => {
                sub = new RealTimeSubscription(msg.getStreamId(), msg.getStreamPartition(), () => {})
                sub.onError = jest.fn()
                const error = new Error('test error, ignore')
                sub.addPendingResendRequestId('requestId')
                sub.once('resent', () => { throw error })
                sub.setResending(true)
                await sub.handleResentMessage(msg, 'requestId', async () => true)

                await sub.handleResent(new ControlLayer.ResendResponseResent({
                    streamId: 'streamId',
                    streamPartition: 0,
                    requestId: 'requestId',
                }))
                expect(!sub.isResending()).toBeTruthy()
            })
        })
    })

    describe('handleNoResend()', () => {
        it('emits the no_resend event', async () => {
            const sub = new RealTimeSubscription(msg.getStreamId(), msg.getStreamPartition(), () => {})
            sub.addPendingResendRequestId('requestId')
            const onNoResent = new Promise((resolve) => sub.once('no_resend', resolve))
            sub.setResending(true)
            await sub.handleNoResend(new ControlLayer.ResendResponseNoResend({
                streamId: 'streamId',
                streamPartition: 0,
                requestId: 'requestId',
            }))
            expect(!sub.isResending()).toBeTruthy()
            await onNoResent
        })

        describe('on error', () => {
            let sub

            afterEach(() => {
                sub.stop()
            })

            it('cleans up the resend if event handler throws', async () => {
                sub = new RealTimeSubscription(msg.getStreamId(), msg.getStreamPartition(), () => {})
                sub.onError = jest.fn()
                const error = new Error('test error, ignore')
                sub.addPendingResendRequestId('requestId')
                sub.once('no_resend', () => { throw error })
                sub.setResending(true)
                await sub.handleNoResend(new ControlLayer.ResendResponseNoResend({
                    streamId: 'streamId',
                    streamPartition: 0,
                    requestId: 'requestId',
                }))
                expect(!sub.isResending()).toBeTruthy()
            })
        })
    })
})

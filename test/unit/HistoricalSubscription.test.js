import crypto from 'crypto'

import sinon from 'sinon'
import { ControlLayer, MessageLayer, Errors } from 'streamr-client-protocol'
import { wait } from 'streamr-test-utils'

import HistoricalSubscription from '../../src/HistoricalSubscription'
import EncryptionUtil from '../../src/EncryptionUtil'
import Subscription from '../../src/Subscription'

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
        messageType: StreamMessage.MESSAGE_TYPES.MESSAGE,
        encryptionType,
        signatureType: StreamMessage.SIGNATURE_TYPES.NONE,
        signature: '',
    })
}

describe('HistoricalSubscription', () => {
    let msg
    beforeEach(() => {
        msg = createMsg()
    })

    describe('message handling', () => {
        describe('handleBroadcastMessage()', () => {
            it('calls the message handler', () => {
                const sub = new HistoricalSubscription({
                    streamId: msg.getStreamId(),
                    streamPartition: msg.getStreamPartition(),
                    callback: (content, receivedMsg) => {
                        expect(content).toEqual(msg.getParsedContent())
                        expect(msg).toEqual(receivedMsg)
                    },
                    options: {
                        last: 1,
                    },
                })
                return sub.handleResentMessage(msg, 'requestId', sinon.stub().resolves(true))
            })

            describe('on error', () => {
                let stdError
                let sub

                beforeEach(() => {
                    const msgHandler = () => { throw new Error('should not be called!') }

                    sub = new HistoricalSubscription({
                        streamId: msg.getStreamId(),
                        streamPartition: msg.getStreamPartition(),
                        callback: msgHandler,
                        options: {
                            last: 1,
                        },
                    })
                    stdError = console.error
                    console.error = sinon.stub()
                })

                afterEach(() => {
                    console.error = stdError
                    sub.stop()
                })

                describe('when message verification throws', () => {
                    it('emits an error event', async (done) => {
                        const error = new Error('test error')
                        sub.once('error', (err) => {
                            expect(err).toBe(error)
                            done()
                        })
                        return sub.handleResentMessage(msg, 'requestId', sinon.stub().throws(error))
                    })
                })

                describe('when message handler throws', () => {
                    it('emits an error event', async (done) => {
                        sub.once('error', (err) => {
                            expect(err.message).toContain('should not be called!')
                            done()
                        })
                        return sub.handleResentMessage(msg, 'requestId', sinon.stub().resolves(true))
                    })

                    it('prints to standard error stream', async (done) => {
                        sub.once('error', (err) => {
                            expect(err.message).toContain('should not be called!')
                            done()
                        })
                        return sub.handleResentMessage(msg, 'requestId', sinon.stub().resolves(true))
                    })
                })
            })

            it('calls the callback once for each message in order', (done) => {
                const msgs = [1, 2, 3, 4, 5].map((timestamp) => createMsg(
                    timestamp,
                    timestamp === 1 ? 0 : timestamp - 1,
                ))

                const received = []

                const sub = new HistoricalSubscription({
                    streamId: msg.getStreamId(),
                    streamPartition: msg.getStreamPartition(),
                    callback: (content, receivedMsg) => {
                        received.push(receivedMsg)
                        if (received.length === 5) {
                            expect(msgs).toEqual(received)
                            done()
                        }
                    },
                    options: {
                        last: 1,
                    },
                })

                return Promise.all(msgs.map((m) => sub.handleResentMessage(m, 'requestId', sinon.stub().resolves(true))))
            })

            it('calls the callback once for each message in order, regardless of verification order', (done) => {
                const msgs = [1, 2, 3, 4, 5].map((timestamp) => createMsg(
                    timestamp,
                    timestamp === 1 ? 0 : timestamp - 1,
                ))

                const received = []

                const sub = new HistoricalSubscription({
                    streamId: msg.getStreamId(),
                    streamPartition: msg.getStreamPartition(),
                    callback: (content, receivedMsg) => {
                        received.push(receivedMsg)
                        if (received.length === 5) {
                            expect(received).toEqual(msgs)
                            done()
                        }
                    },
                    options: {
                        last: 5,
                    },
                })

                return Promise.all(msgs.map((m, index, arr) => sub.handleResentMessage(m, 'requestId', async () => {
                    // make earlier messages validate after later messages
                    await wait(10 + (arr.length - index) * 20)
                    return true
                })))
            })

            it('does not wait for future messages before handling message', (done) => {
                const msgs = [1, 2, 3, 4, 5].map((timestamp) => createMsg(
                    timestamp,
                    timestamp === 1 ? 0 : timestamp - 1,
                ))

                const received = []

                let resolveLastMessageValidation
                const lastMessageValidation = new Promise((resolve) => {
                    resolveLastMessageValidation = resolve
                })

                const sub = new HistoricalSubscription({
                    streamId: msg.getStreamId(),
                    streamPartition: msg.getStreamPartition(),
                    callback: (content, receivedMsg) => {
                        received.push(receivedMsg)
                        if (received.length === 4) {
                            // only resolve last message when 4th message received
                            resolveLastMessageValidation()
                        }

                        if (received.length === 5) {
                            expect(received).toEqual(msgs)
                            done()
                        }
                    },
                    options: {
                        last: 5,
                    }
                })

                return Promise.all(msgs.map((m, index, arr) => sub.handleResentMessage(m, 'requestId', async () => {
                    if (index === arr.length - 1) {
                        await lastMessageValidation
                    } else {
                        await wait(50)
                    }
                    return true
                })))
            })
        })

        describe('duplicate handling', () => {
            it('ignores re-received messages', async () => {
                const handler = sinon.stub()
                const sub = new HistoricalSubscription({
                    streamId: msg.getStreamId(),
                    streamPartition: msg.getStreamPartition(),
                    callback: handler,
                    options: {
                        last: 1,
                    }
                })

                await sub.handleResentMessage(msg, 'requestId', sinon.stub().resolves(true))
                await sub.handleResentMessage(msg, 'requestId', sinon.stub().resolves(true))
                expect(handler.callCount).toEqual(1)
                sub.stop()
            })
        })

        describe('gap detection', () => {
            it('emits "gap" if a gap is detected', (done) => {
                const msg1 = msg
                const msg4 = createMsg(4, undefined, 3)

                const sub = new HistoricalSubscription({
                    streamId: msg.getStreamId(),
                    streamPartition: msg.getStreamPartition(),
                    callback: sinon.stub(),
                    options: {
                        last: 1,
                    },
                    propagationTimeout: 100,
                    resendTimeout: 100,
                })

                sub.on('gap', (from, to, publisherId) => {
                    expect(from.timestamp).toEqual(1)
                    expect(from.sequenceNumber).toEqual(1)
                    expect(to.timestamp).toEqual(3)
                    expect(to.sequenceNumber).toEqual(0)
                    expect(publisherId).toEqual('publisherId')
                    setTimeout(() => {
                        sub.stop()
                        done()
                    }, 100)
                })

                sub.handleResentMessage(msg1, 'requestId', sinon.stub().resolves(true))
                sub.handleResentMessage(msg4, 'requestId', sinon.stub().resolves(true))
            })

            it('emits second "gap" after the first one if no missing message is received in between', (done) => {
                const msg1 = msg
                const msg4 = createMsg(4, undefined, 3)

                const sub = new HistoricalSubscription({
                    streamId: msg.getStreamId(),
                    streamPartition: msg.getStreamPartition(),
                    callback: sinon.stub(),
                    options: {
                        last: 1,
                    },
                    propagationTimeout: 100,
                    resendTimeout: 100,
                })
                sub.once('gap', (from, to, publisherId) => {
                    sub.once('gap', (from2, to2, publisherId2) => {
                        expect(from).toStrictEqual(from2)
                        expect(to).toStrictEqual(to2)
                        expect(publisherId).toStrictEqual(publisherId2)
                        sub.stop()
                        done()
                    })
                })

                sub.handleResentMessage(msg1, 'requestId', sinon.stub().resolves(true))
                sub.handleResentMessage(msg4, 'requestId', sinon.stub().resolves(true))
            })

            it('does not emit second "gap" after the first one if the missing messages are received in between', (done) => {
                const msg1 = msg
                const msg2 = createMsg(2, undefined, 1)
                const msg3 = createMsg(3, undefined, 2)
                const msg4 = createMsg(4, undefined, 3)

                const sub = new HistoricalSubscription({
                    streamId: msg.getStreamId(),
                    streamPartition: msg.getStreamPartition(),
                    callback: sinon.stub(),
                    options: {
                        last: 1,
                    },
                    propagationTimeout: 100,
                    resendTimeout: 100,
                })

                sub.once('gap', () => {
                    sub.handleResentMessage(msg2, 'requestId', sinon.stub().resolves(true))
                    sub.handleResentMessage(msg3, 'requestId', sinon.stub().resolves(true)).then(() => {})
                    sub.once('gap', () => { throw new Error('should not emit second gap') })
                    setTimeout(() => {
                        sub.stop()
                        done()
                    }, 100 + 1000)
                })

                sub.handleResentMessage(msg1, 'requestId', sinon.stub().resolves(true))
                sub.handleResentMessage(msg4, 'requestId', sinon.stub().resolves(true))
            })

            it('does not emit second "gap" if gets unsubscribed', async (done) => {
                const msg1 = msg
                const msg4 = createMsg(4, undefined, 3)

                const sub = new HistoricalSubscription({
                    streamId: msg.getStreamId(),
                    streamPartition: msg.getStreamPartition(),
                    callback: sinon.stub(),
                    options: {
                        last: 1,
                    },
                    propagationTimeout: 100,
                    resendTimeout: 100,
                })

                sub.once('gap', () => {
                    sub.emit('unsubscribed')
                    sub.once('gap', () => { throw new Error('should not emit second gap') })
                    setTimeout(() => {
                        sub.stop()
                        done()
                    }, 100 + 1000)
                })

                sub.handleResentMessage(msg1, 'requestId', sinon.stub().resolves(true))
                sub.handleResentMessage(msg4, 'requestId', sinon.stub().resolves(true))
            })

            it('does not emit second "gap" if gets disconnected', async (done) => {
                const msg1 = msg
                const msg4 = createMsg(4, undefined, 3)
                const sub = new HistoricalSubscription({
                    streamId: msg.getStreamId(),
                    streamPartition: msg.getStreamPartition(),
                    callback: sinon.stub(),
                    options: {
                        last: 1,
                    },
                    propagationTimeout: 100,
                    resendTimeout: 100,
                })
                sub.once('gap', () => {
                    sub.emit('disconnected')
                    sub.once('gap', () => { throw new Error('should not emit second gap') })
                    setTimeout(() => {
                        sub.stop()
                        done()
                    }, 100 + 1000)
                })

                sub.handleResentMessage(msg1, 'requestId', sinon.stub().resolves(true))
                sub.handleResentMessage(msg4, 'requestId', sinon.stub().resolves(true))
            })

            it('does not emit "gap" if different publishers', () => {
                const msg1 = msg
                const msg1b = createMsg(1, 0, undefined, 0, {}, 'anotherPublisherId')

                const sub = new HistoricalSubscription({
                    streamId: msg.getStreamId(),
                    streamPartition: msg.getStreamPartition(),
                    callback: sinon.stub(),
                    options: {
                        last: 1,
                    },
                    propagationTimeout: 100,
                    resendTimeout: 100,
                })

                sub.on('gap', () => {
                    throw new Error('unexpected gap')
                })

                sub.handleResentMessage(msg1, 'requestId', sinon.stub().resolves(true))
                sub.handleResentMessage(msg1b, 'requestId', sinon.stub().resolves(true))
            })

            it('emits "gap" if a gap is detected (same timestamp but different sequenceNumbers)', (done) => {
                const msg1 = msg
                const msg4 = createMsg(1, 4, 1, 3)

                const sub = new HistoricalSubscription({
                    streamId: msg.getStreamId(),
                    streamPartition: msg.getStreamPartition(),
                    callback: sinon.stub(),
                    options: {
                        last: 1,
                    },
                    propagationTimeout: 100,
                    resendTimeout: 100,
                })

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

                sub.handleResentMessage(msg1, 'requestId', sinon.stub().resolves(true))
                sub.handleResentMessage(msg4, 'requestId', sinon.stub().resolves(true))
            })

            it('does not emit "gap" if a gap is not detected', () => {
                const msg1 = msg
                const msg2 = createMsg(2, undefined, 1)

                const sub = new HistoricalSubscription({
                    streamId: msg.getStreamId(),
                    streamPartition: msg.getStreamPartition(),
                    callback: sinon.stub(),
                    options: {
                        last: 1,
                    },
                    propagationTimeout: 100,
                    resendTimeout: 100,
                })
                sub.on('gap', sinon.stub().throws())

                sub.handleResentMessage(msg1, 'requestId', sinon.stub().resolves(true))
                sub.handleResentMessage(msg2, 'requestId', sinon.stub().resolves(true))
            })

            it('does not emit "gap" if a gap is not detected (same timestamp but different sequenceNumbers)', () => {
                const msg1 = msg
                const msg2 = createMsg(1, 1, 1, 0)

                const sub = new HistoricalSubscription({
                    streamId: msg.getStreamId(),
                    streamPartition: msg.getStreamPartition(),
                    callback: sinon.stub(),
                    options: {
                        last: 1,
                    },
                    propagationTimeout: 100,
                    resendTimeout: 100,
                })

                sub.once('gap', sinon.stub().throws())

                sub.handleResentMessage(msg1, 'requestId', sinon.stub().resolves(true))
                sub.handleResentMessage(msg2, 'requestId', sinon.stub().resolves(true))
            })

            describe('ordering util', () => {
                it('handles messages in the order in which they arrive if no ordering util', async () => {
                    const msg1 = msg
                    const msg2 = createMsg(2, 0, 1, 0)
                    const msg3 = createMsg(3, 0, 2, 0)
                    const msg4 = createMsg(4, 0, 3, 0)
                    const received = []

                    const sub = new HistoricalSubscription({
                        streamId: msg.getStreamId(),
                        streamPartition: msg.getStreamPartition(),
                        callback: (content, receivedMsg) => {
                            received.push(receivedMsg)
                        },
                        options: {
                            last: 1,
                        },
                        propagationTimeout: 100,
                        resendTimeout: 100,
                        orderMessages: false,
                    })

                    sub.on('gap', sinon.stub().throws())

                    await sub.handleResentMessage(msg1, 'requestId', sinon.stub().resolves(true))
                    await sub.handleResentMessage(msg2, 'requestId', sinon.stub().resolves(true))
                    await sub.handleResentMessage(msg4, 'requestId', sinon.stub().resolves(true))
                    await sub.handleResentMessage(msg2, 'requestId', sinon.stub().resolves(true))
                    await sub.handleResentMessage(msg3, 'requestId', sinon.stub().resolves(true))
                    await sub.handleResentMessage(msg1, 'requestId', sinon.stub().resolves(true))

                    expect(received).toStrictEqual([msg1, msg2, msg4, msg2, msg3, msg1])
                })

                it('handles messages in order without duplicates if ordering util is set', async () => {
                    const msg1 = msg
                    const msg2 = createMsg(2, 0, 1, 0)
                    const msg3 = createMsg(3, 0, 2, 0)
                    const msg4 = createMsg(4, 0, 3, 0)
                    const received = []

                    const sub = new HistoricalSubscription({
                        streamId: msg.getStreamId(),
                        streamPartition: msg.getStreamPartition(),
                        callback: (content, receivedMsg) => {
                            received.push(receivedMsg)
                        },
                        options: {
                            last: 1,
                        },
                        propagationTimeout: 100,
                        resendTimeout: 100,
                        orderMessages: true,
                    })

                    await sub.handleResentMessage(msg1, 'requestId', sinon.stub().resolves(true))
                    await sub.handleResentMessage(msg2, 'requestId', sinon.stub().resolves(true))
                    await sub.handleResentMessage(msg4, 'requestId', sinon.stub().resolves(true))
                    await sub.handleResentMessage(msg2, 'requestId', sinon.stub().resolves(true))
                    await sub.handleResentMessage(msg3, 'requestId', sinon.stub().resolves(true))
                    await sub.handleResentMessage(msg1, 'requestId', sinon.stub().resolves(true))

                    expect(received).toStrictEqual([msg1, msg2, msg3, msg4])
                })
            })
        })

        it('emits done after processing a message with the bye key', (done) => {
            const byeMsg = createMsg(1, undefined, null, null, {
                _bye: true,
            })

            const handler = sinon.stub()
            const sub = new HistoricalSubscription({
                streamId: byeMsg.getStreamId(),
                streamPartition: byeMsg.getStreamPartition(),
                callback: handler,
                options: {
                    last: 1,
                },
                propagationTimeout: 100,
                resendTimeout: 100,
            })
            sub.once('done', () => {
                expect(handler.calledOnce).toBeTruthy()
                done()
            })

            sub.handleResentMessage(byeMsg, 'requestId', sinon.stub().resolves(true))
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
                sub = new HistoricalSubscription({
                    streamId: msg1.getStreamId(),
                    streamPartition: msg1.getStreamPartition(),
                    callback: (content) => {
                        expect(content).toStrictEqual(msg1.getParsedContent())
                        done()
                    },
                    options: {
                        last: 1,
                    },
                })
                return sub.handleResentMessage(msg1, 'requestId', sinon.stub().resolves(true))
            })

            it('should decrypt encrypted content with the correct key', (done) => {
                const groupKey = crypto.randomBytes(32)
                const data = {
                    foo: 'bar',
                }
                const msg1 = createMsg(1, 0, null, 0, data)
                EncryptionUtil.encryptStreamMessage(msg1, groupKey)
                sub = new HistoricalSubscription({
                    streamId: msg1.getStreamId(),
                    streamPartition: msg1.getStreamPartition(),
                    callback: (content) => {
                        expect(content).toStrictEqual(data)
                        done()
                    },
                    options: {
                        last: 1,
                    },
                    groupKeys: {
                        publisherId: groupKey,
                    }
                })
                return sub.handleResentMessage(msg1, 'requestId', sinon.stub().resolves(true))
            })

            it('should emit "groupKeyMissing" with range when no historical group keys are set', (done) => {
                const correctGroupKey = crypto.randomBytes(32)
                const msg1 = createMsg(1, 0, null, 0, {
                    foo: 'bar',
                })
                EncryptionUtil.encryptStreamMessage(msg1, correctGroupKey)
                sub = new HistoricalSubscription({
                    streamId: msg1.getStreamId(),
                    streamPartition: msg1.getStreamPartition(),
                    callback: () => {},
                    options: {
                        last: 1,
                    },
                })
                sub.on('groupKeyMissing', (publisherId, start, end) => {
                    expect(publisherId).toBe(msg1.getPublisherId())
                    expect(start).toBe(msg1.getTimestamp())
                    expect(end).toBeTruthy()
                    done()
                })
                return sub.handleResentMessage(msg1, 'requestId', sinon.stub().resolves(true))
            })

            it('should queue messages when not able to decrypt and handle them once the keys are set', async () => {
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
                EncryptionUtil.encryptStreamMessage(msg1, groupKey1)
                EncryptionUtil.encryptStreamMessage(msg2, groupKey2)
                let received1 = null
                let received2 = null
                sub = new HistoricalSubscription({
                    streamId: msg1.getStreamId(),
                    streamPartition: msg1.getStreamPartition(),
                    callback: (content) => {
                        if (!received1) {
                            received1 = content
                        } else {
                            received2 = content
                        }
                    },
                    options: {
                        last: 1,
                    },
                })
                // cannot decrypt msg1, queues it and emits "groupKeyMissing" (should send group key request).
                await sub.handleResentMessage(msg1, 'requestId', sinon.stub().resolves(true))
                // cannot decrypt msg2, queues it.
                await sub.handleResentMessage(msg2, 'requestId', sinon.stub().resolves(true))
                // faking the reception of the group key response
                sub.setGroupKeys('publisherId', [groupKey1, groupKey2])
                // try again to decrypt the queued messages but this time with the correct key
                expect(received1).toStrictEqual(data1)
                expect(received2).toStrictEqual(data2)
            })

            it('should call "onUnableToDecrypt" when not able to decrypt with historical keys set', async () => {
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
                let undecryptableMsg = null
                sub = new HistoricalSubscription({
                    streamId: msg1.getStreamId(),
                    streamPartition: msg1.getStreamPartition(),
                    callback: () => {
                        throw new Error('should not call the handler')
                    },
                    options: {
                        last: 1,
                    },
                    onUnableToDecrypt: (error) => {
                        undecryptableMsg = error.streamMessage
                    }
                })
                // cannot decrypt msg1, emits "groupKeyMissing" (should send group key request).
                await sub.handleResentMessage(msg1, 'requestId', sinon.stub().resolves(true))
                // cannot decrypt msg2, queues it.
                await sub.handleResentMessage(msg2, 'requestId', sinon.stub().resolves(true))
                // faking the reception of the group key response
                sub.setGroupKeys('publisherId', [wrongGroupKey])

                expect(undecryptableMsg).toStrictEqual(msg2)
            })

            it('should queue messages when not able to decrypt and handle them once the keys are set (multiple publishers)', async () => {
                const groupKey1 = crypto.randomBytes(32)
                const groupKey2 = crypto.randomBytes(32)
                const groupKey3 = crypto.randomBytes(32)
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
                EncryptionUtil.encryptStreamMessage(msg2, groupKey2)
                EncryptionUtil.encryptStreamMessage(msg3, groupKey3)
                EncryptionUtil.encryptStreamMessage(msg4, groupKey3)
                const received = []
                sub = new HistoricalSubscription({
                    streamId: msg1.getStreamId(),
                    streamPartition: msg1.getStreamPartition(),
                    callback: (content) => {
                        received.push(content)
                    },
                    options: {
                        last: 1,
                    },
                })
                // cannot decrypt msg1, queues it and emits "groupKeyMissing" (should send group key request).
                await sub.handleResentMessage(msg1, 'requestId', sinon.stub().resolves(true))
                // cannot decrypt msg2, queues it.
                await sub.handleResentMessage(msg2, 'requestId', sinon.stub().resolves(true))
                // cannot decrypt msg3, queues it and emits "groupKeyMissing" (should send group key request).
                await sub.handleResentMessage(msg3, 'requestId', sinon.stub().resolves(true))
                // cannot decrypt msg4, queues it.
                await sub.handleResentMessage(msg4, 'requestId', sinon.stub().resolves(true))
                // faking the reception of the group key response
                sub.setGroupKeys('publisherId2', [groupKey3])
                sub.setGroupKeys('publisherId1', [groupKey1, groupKey2])
                // try again to decrypt the queued messages but this time with the correct key
                expect(received[0]).toStrictEqual(data3)
                expect(received[1]).toStrictEqual(data4)
                expect(received[2]).toStrictEqual(data1)
                expect(received[3]).toStrictEqual(data2)
            })
        })
    })

    describe('handleError()', () => {
        it('emits an error event', (done) => {
            const err = new Error('Test error')
            const sub = new HistoricalSubscription({
                streamId: msg.getStreamId(),
                streamPartition: msg.getStreamPartition(),
                callback: sinon.stub().throws('Msg handler should not be called!'),
                options: {
                    last: 1,
                },
            })
            sub.onError = jest.fn()
            sub.once('error', (thrown) => {
                expect(thrown).toBe(err)
                expect(sub.onError).toHaveBeenCalled()
                done()
            })
            sub.handleError(err)
        })

        it('marks the message as received if an InvalidJsonError occurs, and continue normally on next message', async (done) => {
            const sub = new HistoricalSubscription({
                streamId: msg.getStreamId(),
                streamPartition: msg.getStreamPartition(),
                callback: (content, receivedMsg) => {
                    if (receivedMsg.getTimestamp() === 3) {
                        sub.stop()
                        done()
                    }
                },
                options: {
                    last: 1,
                },
            })

            sub.onError = jest.fn()

            sub.on('gap', sinon.stub().throws('Should not emit gap!'))

            const msg1 = msg
            const msg3 = createMsg(3, undefined, 2)

            // Receive msg1 successfully
            await sub.handleResentMessage(msg1, 'requestId', sinon.stub().resolves(true))

            // Get notified of an invalid message
            const err = new Errors.InvalidJsonError(msg.getStreamId(), 'invalid json', 'test error msg', createMsg(2, undefined, 1))
            sub.handleError(err)

            // Receive msg3 successfully
            await sub.handleResentMessage(msg3, 'requestId', sinon.stub().resolves(true))
            expect(sub.onError).toHaveBeenCalled()
        })

        it('if an InvalidJsonError AND a gap occur, does not mark it as received and emits gap at the next message', async (done) => {
            const sub = new HistoricalSubscription({
                streamId: msg.getStreamId(),
                streamPartition: msg.getStreamPartition(),
                callback: sinon.stub(),
                options: {
                    last: 1,
                },
                propagationTimeout: 100,
                resendTimeout: 100,
            })

            sub.onError = jest.fn()

            sub.once('gap', (from, to, publisherId) => {
                expect(from.timestamp).toEqual(1) // cannot know the first missing message so there will be a duplicate received
                expect(from.sequenceNumber).toEqual(1)
                expect(to.timestamp).toEqual(3)
                expect(to.sequenceNumber).toEqual(0)
                expect(publisherId).toEqual('publisherId')

                setTimeout(() => {
                    expect(sub.onError).toHaveBeenCalled()
                    sub.stop()
                    done()
                }, 100)
            })

            const msg1 = msg
            const msg4 = createMsg(4, undefined, 3)

            // Receive msg1 successfully
            await sub.handleResentMessage(msg1, 'requestId', sinon.stub().resolves(true))

            // Get notified of invalid msg3 (msg2 is missing)
            const err = new Errors.InvalidJsonError(msg.getStreamId(), 'invalid json', 'test error msg', createMsg(3, undefined, 2))
            sub.handleError(err)

            // Receive msg4 and should emit gap
            await sub.handleResentMessage(msg4, 'requestId', sinon.stub().resolves(true))
        })
    })

    describe('setState()', () => {
        it('updates the state', () => {
            const sub = new HistoricalSubscription({
                streamId: msg.getStreamId(),
                streamPartition: msg.getStreamPartition(),
                callback: sinon.stub(),
                options: {
                    last: 1,
                },
            })
            sub.setState(Subscription.State.subscribed)
            expect(sub.getState()).toEqual(Subscription.State.subscribed)
        })

        it('fires an event', (done) => {
            const sub = new HistoricalSubscription({
                streamId: msg.getStreamId(),
                streamPartition: msg.getStreamPartition(),
                callback: sinon.stub(),
                options: {
                    last: 1,
                },
            })
            sub.once(Subscription.State.subscribed, done)
            sub.setState(Subscription.State.subscribed)
        })
    })

    describe('handleResending()', () => {
        it('emits the resending event', async () => {
            const sub = new HistoricalSubscription({
                streamId: msg.getStreamId(),
                streamPartition: msg.getStreamPartition(),
                callback: sinon.stub(),
                options: {
                    last: 1,
                },
            })
            sub.addPendingResendRequestId('requestId')
            const onResending = new Promise((resolve) => sub.once('resending', resolve))
            sub.handleResending(new ControlLayer.ResendResponseResending({
                streamId: 'streamId',
                streamPartition: 0,
                requestId: 'requestId',
            }))
            await onResending
        })
    })

    describe('handleResent()', () => {
        it('emits the "resent" + "initial_resend_done" events on last message (message handler completes BEFORE resent)', async (done) => {
            const handler = sinon.stub()
            const sub = new HistoricalSubscription({
                streamId: msg.getStreamId(),
                streamPartition: msg.getStreamPartition(),
                callback: handler,
                options: {
                    last: 1,
                },
            })
            sub.addPendingResendRequestId('requestId')

            sub.once('resent', () => sub.once('initial_resend_done', () => done()))
            await sub.handleResentMessage(msg, 'requestId', sinon.stub().resolves(true))
            sub.handleResent(new ControlLayer.ResendResponseResent({
                streamId: 'streamId',
                streamPartition: 0,
                requestId: 'requestId',
            }))
        })

        it('arms the Subscription to emit the resent event on last message (message handler completes AFTER resent)', async () => {
            const handler = sinon.stub()
            const sub = new HistoricalSubscription({
                streamId: msg.getStreamId(),
                streamPartition: msg.getStreamPartition(),
                callback: handler,
                options: {
                    last: 1,
                },
            })
            sub.addPendingResendRequestId('requestId')
            const onResent = new Promise((resolve) => sub.once('resent', resolve))
            sub.handleResentMessage(msg, 'requestId', sinon.stub().resolves(true))
            sub.handleResent(new ControlLayer.ResendResponseResent({
                streamId: 'streamId',
                streamPartition: 0,
                requestId: 'requestId',
            }))
            await onResent
        })

        it('should not emit "initial_resend_done" after receiving "resent" if there are still pending resend requests', async () => {
            const handler = sinon.stub()
            const sub = new HistoricalSubscription({
                streamId: msg.getStreamId(),
                streamPartition: msg.getStreamPartition(),
                callback: handler,
                options: {
                    last: 1,
                },
            })
            sub.addPendingResendRequestId('requestId1')
            sub.addPendingResendRequestId('requestId2')
            sub.once('initial_resend_done', () => {
                throw new Error('resend is not done yet! (still waiting for answer to requestId2)')
            })
            const onResent = new Promise((resolve) => sub.once('resent', resolve))
            await sub.handleResentMessage(msg, 'requestId1', sinon.stub().resolves(true))
            sub.handleResent(new ControlLayer.ResendResponseResent({
                streamId: 'streamId',
                streamPartition: 0,
                requestId: 'requestId1',
            }))
            await onResent
        })

        it('emits 2 "resent" and 1 "initial_resend_done" after receiving 2 pending resend response', async (done) => {
            const handler = sinon.stub()
            const sub = new HistoricalSubscription({
                streamId: msg.getStreamId(),
                streamPartition: msg.getStreamPartition(),
                callback: handler,
                options: {
                    last: 1,
                },
            })
            sub.addPendingResendRequestId('requestId1')
            sub.addPendingResendRequestId('requestId2')
            let counter = 0
            sub.on('resent', () => {
                counter += 1
            })
            sub.once('initial_resend_done', () => {
                expect(counter).toBe(2)
                done()
            })
            await sub.handleResentMessage(msg, 'requestId1', sinon.stub().resolves(true))
            await sub.handleResentMessage(msg, 'requestId2', sinon.stub().resolves(true))
            sub.handleResent(new ControlLayer.ResendResponseResent({
                streamId: 'streamId',
                streamPartition: 0,
                requestId: 'requestId1',
            }))
            sub.handleResent(new ControlLayer.ResendResponseResent({
                streamId: 'streamId',
                streamPartition: 0,
                requestId: 'requestId2',
            }))
        })

        it('can handle a second resend while in the middle of resending', async (done) => {
            const handler = sinon.stub()
            const sub = new HistoricalSubscription({
                streamId: msg.getStreamId(),
                streamPartition: msg.getStreamPartition(),
                callback: handler,
                options: {
                    last: 1,
                },
            })
            sub.addPendingResendRequestId('requestId1')
            sub.addPendingResendRequestId('requestId2')
            sub.once('resent', () => sub.once('initial_resend_done', () => done()))
            await sub.handleResentMessage(msg, 'requestId1', sinon.stub().resolves(true))
            sub.handleNoResend(new ControlLayer.ResendResponseNoResend({
                streamId: 'streamId',
                streamPartition: 0,
                requestId: 'requestId2',
            }))
            sub.handleResent(new ControlLayer.ResendResponseResent({
                streamId: 'streamId',
                streamPartition: 0,
                requestId: 'requestId1',
            }))
        })
    })

    describe('handleNoResend()', () => {
        it('emits the no_resend event and then the initial_resend_done event', (done) => {
            const sub = new HistoricalSubscription({
                streamId: msg.getStreamId(),
                streamPartition: msg.getStreamPartition(),
                callback: sinon.stub(),
                options: {
                    last: 1,
                },
            })
            sub.addPendingResendRequestId('requestId')
            sub.once('no_resend', () => sub.once('initial_resend_done', () => done()))
            sub.handleNoResend(new ControlLayer.ResendResponseNoResend({
                streamId: 'streamId',
                streamPartition: 0,
                requestId: 'requestId',
            }))
        })

        it('should not emit "initial_resend_done" after receiving "no resend" if there are still pending resend requests', async (done) => {
            const handler = sinon.stub()
            const sub = new HistoricalSubscription({
                streamId: msg.getStreamId(),
                streamPartition: msg.getStreamPartition(),
                callback: handler,
                options: {
                    last: 1,
                },
            })
            sub.addPendingResendRequestId('requestId1')
            sub.addPendingResendRequestId('requestId2')
            sub.once('initial_resend_done', () => {
                throw new Error('resend is not done yet! (still waiting for answer to requestId2)')
            })
            sub.once('no_resend', () => setTimeout(done, 2000))
            await sub.handleResentMessage(msg, 'requestId', sinon.stub().resolves(true))
            sub.handleNoResend(new ControlLayer.ResendResponseNoResend({
                streamId: 'streamId',
                streamPartition: 0,
                requestId: 'requestId1',
            }))
        })

        it('emits 2 "resent" and 1 "initial_resend_done" after receiving 2 pending resend response', async (done) => {
            const handler = sinon.stub()
            const sub = new HistoricalSubscription({
                streamId: msg.getStreamId(),
                streamPartition: msg.getStreamPartition(),
                callback: handler,
                options: {
                    last: 1,
                },
            })
            sub.addPendingResendRequestId('requestId1')
            sub.addPendingResendRequestId('requestId2')
            let counter = 0
            sub.on('no_resend', () => {
                counter += 1
            })
            sub.once('initial_resend_done', () => {
                expect(counter).toBe(2)
                done()
            })
            await sub.handleResentMessage(msg, 'requestId', sinon.stub().resolves(true))
            sub.handleNoResend(new ControlLayer.ResendResponseNoResend({
                streamId: 'streamId',
                streamPartition: 0,
                requestId: 'requestId1',
            }))
            sub.handleNoResend(new ControlLayer.ResendResponseNoResend({
                streamId: 'streamId',
                streamPartition: 0,
                requestId: 'requestId2',
            }))
        })
    })
})

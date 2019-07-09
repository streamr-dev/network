import assert from 'assert'
import crypto from 'crypto'

import sinon from 'sinon'
import { ControlLayer, MessageLayer, Errors } from 'streamr-client-protocol'

import Subscription from '../../src/Subscription'
import InvalidSignatureError from '../../src/errors/InvalidSignatureError'
import VerificationFailedError from '../../src/errors/VerificationFailedError'
import EncryptionUtil from '../../src/EncryptionUtil'

const { StreamMessage } = MessageLayer

const createMsg = (
    timestamp = 1, sequenceNumber = 0, prevTimestamp = null,
    prevSequenceNumber = 0, content = {}, publisherId = 'publisherId', msgChainId = '1',
    encryptionType = StreamMessage.ENCRYPTION_TYPES.NONE,
) => {
    const prevMsgRef = prevTimestamp ? [prevTimestamp, prevSequenceNumber] : null
    return StreamMessage.create(
        ['streamId', 0, timestamp, sequenceNumber, publisherId, msgChainId], prevMsgRef,
        StreamMessage.CONTENT_TYPES.MESSAGE, encryptionType, content, StreamMessage.SIGNATURE_TYPES.NONE,
    )
}

const msg = createMsg()

const RESEND_TIMEOUT = 5000

describe('Subscription', () => {
    describe('message handling', () => {
        describe('handleBroadcastMessage()', () => {
            it('calls the message handler', () => {
                const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), (content, receivedMsg) => {
                    assert.deepEqual(content, msg.getParsedContent())
                    assert.equal(msg, receivedMsg)
                })
                return sub.handleBroadcastMessage(msg, sinon.stub().resolves(true))
            })

            describe('on error', () => {
                let stdError
                let sub

                beforeEach(() => {
                    sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub().throws('should not be called!'))
                    stdError = console.error
                    console.error = sinon.stub()
                })

                afterEach(() => {
                    console.error = stdError
                    sub.stop()
                })

                describe('when message verification returns false', () => {
                    it('does not call the message handler', async () => sub.handleBroadcastMessage(msg, sinon.stub().resolves(false)))

                    it('prints to standard error stream', async () => {
                        await sub.handleBroadcastMessage(msg, sinon.stub().resolves(false))
                        assert(console.error.calledWith(sinon.match.instanceOf(InvalidSignatureError)))
                    })

                    it('emits an error event', async (done) => {
                        sub.on('error', (err) => {
                            assert(err instanceof InvalidSignatureError)
                            done()
                        })
                        return sub.handleBroadcastMessage(msg, sinon.stub().resolves(false))
                    })
                })

                describe('when message verification throws', () => {
                    it('emits an error event', async (done) => {
                        const error = new Error('test error')
                        sub.on('error', (err) => {
                            assert(err instanceof VerificationFailedError)
                            assert.strictEqual(err.cause, error)
                            done()
                        })
                        return sub.handleBroadcastMessage(msg, sinon.stub().throws(error))
                    })
                })

                describe('when message handler throws', () => {
                    it('emits an error event', async (done) => {
                        sub.on('error', (err) => {
                            assert.strictEqual(err.name, 'should not be called!')
                            done()
                        })
                        return sub.handleBroadcastMessage(msg, sinon.stub().resolves(true))
                    })

                    it('prints to standard error stream', async (done) => {
                        sub.on('error', (err) => {
                            assert.strictEqual(err.name, 'should not be called!')
                            done()
                        })
                        return sub.handleBroadcastMessage(msg, sinon.stub().resolves(true))
                    })
                })
            })

            it('calls the callback once for each message in order', () => {
                const msgs = [1, 2, 3, 4, 5].map((timestamp) => createMsg(
                    timestamp,
                    timestamp === 1 ? 0 : timestamp - 1,
                ))

                const received = []

                const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), (content, receivedMsg) => {
                    received.push(receivedMsg)
                    if (received.length === 5) {
                        assert.deepEqual(msgs, received)
                    }
                })

                return Promise.all(msgs.map((m) => sub.handleBroadcastMessage(m, sinon.stub().resolves(true))))
            })

            it('queues messages during resending', async () => {
                const handler = sinon.stub()
                const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), handler)

                sub.setResending(true)
                await sub.handleBroadcastMessage(msg, sinon.stub().resolves(true))
                assert.equal(handler.callCount, 0)
                assert.equal(sub.queue.length, 1)
            })
        })

        describe('handleResentMessage()', () => {
            it('processes messages if resending is true', async () => {
                const handler = sinon.stub()
                const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), handler)

                sub.setResending(true)
                await sub.handleResentMessage(msg, sinon.stub().resolves(true))
                assert.equal(handler.callCount, 1)
            })

            describe('on error', () => {
                let stdError
                let sub

                beforeEach(() => {
                    sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub()
                        .throws('should not be called!'))
                    sub.setResending(true)
                    stdError = console.error
                    console.error = sinon.stub()
                })

                afterEach(() => {
                    console.error = stdError
                    sub.stop()
                })

                describe('when message verification returns false', () => {
                    it('does not call the message handler', async () => sub.handleResentMessage(msg, sinon.stub()
                        .resolves(false)))

                    it('prints to standard error stream', async () => {
                        await sub.handleResentMessage(msg, sinon.stub()
                            .resolves(false))
                        assert(console.error.calledWith(sinon.match.instanceOf(InvalidSignatureError)))
                    })

                    it('emits an error event', async (done) => {
                        sub.on('error', (err) => {
                            assert(err instanceof InvalidSignatureError)
                            done()
                        })
                        return sub.handleResentMessage(msg, sinon.stub()
                            .resolves(false))
                    })
                })

                describe('when message verification throws', () => {
                    it('emits an error event', async (done) => {
                        const error = new Error('test error')
                        sub.on('error', (err) => {
                            assert(err instanceof VerificationFailedError)
                            assert.strictEqual(err.cause, error)
                            done()
                        })
                        return sub.handleResentMessage(msg, sinon.stub()
                            .throws(error))
                    })
                })

                describe('when message handler throws', () => {
                    it('emits an error event', async (done) => {
                        sub.on('error', (err) => {
                            assert.strictEqual(err.name, 'should not be called!')
                            done()
                        })
                        return sub.handleResentMessage(msg, sinon.stub()
                            .resolves(true))
                    })

                    it('prints to standard error stream', async (done) => {
                        sub.on('error', (err) => {
                            assert.strictEqual(err.name, 'should not be called!')
                            done()
                        })
                        return sub.handleResentMessage(msg, sinon.stub()
                            .resolves(true))
                    })
                })
            })
        })

        describe('duplicate handling', () => {
            it('ignores re-received messages', async () => {
                const handler = sinon.stub()
                const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), handler)

                await sub.handleBroadcastMessage(msg, sinon.stub().resolves(true))
                await sub.handleBroadcastMessage(msg, sinon.stub().resolves(true))
                assert.equal(handler.callCount, 1)
            })
            it('ignores re-received messages if they come from resend', async () => {
                const handler = sinon.stub()
                const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), handler)
                sub.setResending(true)

                await sub.handleBroadcastMessage(msg, sinon.stub().resolves(true))
                await sub.handleResentMessage(msg, sinon.stub().resolves(true))
            })
        })

        describe('gap detection', () => {
            it('emits "gap" if a gap is detected', (done) => {
                const msg1 = msg
                const msg4 = createMsg(4, undefined, 3)

                const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub())
                sub.on('gap', (from, to, publisherId) => {
                    assert.equal(from.timestamp, 1) // cannot know the first missing message so there will be a duplicate received
                    assert.equal(from.sequenceNumber, 0)
                    assert.equal(to.timestamp, 3)
                    assert.equal(to.sequenceNumber, 0)
                    assert.equal(publisherId, 'publisherId')

                    sub.stop()
                    done()
                })

                sub.handleBroadcastMessage(msg1, sinon.stub().resolves(true))
                sub.handleBroadcastMessage(msg4, sinon.stub().resolves(true))
            })

            it('emits second "gap" after the first one if no missing message is received in between', (done) => {
                const clock = sinon.useFakeTimers()
                const msg1 = msg
                const msg4 = createMsg(4, undefined, 3)

                const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub(), {}, RESEND_TIMEOUT)
                sub.on('gap', (from, to, publisherId) => {
                    sub.on('gap', (from2, to2, publisherId2) => {
                        assert.deepStrictEqual(from, from2)
                        assert.deepStrictEqual(to, to2)
                        assert.deepStrictEqual(publisherId, publisherId2)
                        clock.restore()

                        sub.stop()
                        done()
                    })
                })

                sub.handleBroadcastMessage(msg1, sinon.stub().resolves(true))
                sub.handleBroadcastMessage(msg4, sinon.stub().resolves(true)).then(() => {
                    clock.tick(RESEND_TIMEOUT + 1000)
                })
            })

            it('does not emit second "gap" after the first one if the missing messages are received in between', (done) => {
                const msg1 = msg
                const msg2 = createMsg(2, undefined, 1)
                const msg3 = createMsg(3, undefined, 2)
                const msg4 = createMsg(4, undefined, 3)

                const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub(), {}, RESEND_TIMEOUT)
                sub.on('gap', () => {
                    sub.handleBroadcastMessage(msg2, sinon.stub().resolves(true))
                    sub.handleBroadcastMessage(msg3, sinon.stub().resolves(true))
                    sub.on('gap', () => { throw new Error('should not emit second gap') })
                    const clock = sinon.useFakeTimers()
                    setTimeout(() => {
                        clock.restore()
                        sub.stop()
                        done()
                    }, RESEND_TIMEOUT + 1000)
                    clock.tick(RESEND_TIMEOUT + 1000)
                })

                sub.handleBroadcastMessage(msg1, sinon.stub().resolves(true))
                sub.handleBroadcastMessage(msg4, sinon.stub().resolves(true))
            })

            it('does not emit second "gap" if gets unsubscribed', async (done) => {
                const msg1 = msg
                const msg4 = createMsg(4, undefined, 3)

                const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub(), {}, RESEND_TIMEOUT)
                sub.once('gap', () => {
                    sub.on('gap', () => { throw new Error('should not emit second gap') })
                    const clock = sinon.useFakeTimers()
                    setTimeout(() => {
                        clock.restore()
                        sub.stop()
                        done()
                    }, RESEND_TIMEOUT + 1000)
                    clock.tick(RESEND_TIMEOUT + 1000)
                })

                await sub.handleBroadcastMessage(msg1, sinon.stub().resolves(true))
                await sub.handleBroadcastMessage(msg4, sinon.stub().resolves(true))
                sub.emit('unsubscribed')
            })

            it('does not emit second "gap" if gets disconnected', async (done) => {
                const msg1 = msg
                const msg4 = createMsg(4, undefined, 3)

                const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub(), {}, RESEND_TIMEOUT)
                sub.once('gap', () => {
                    sub.on('gap', () => { throw new Error('should not emit second gap') })
                    const clock = sinon.useFakeTimers()
                    setTimeout(() => {
                        clock.restore()
                        sub.stop()
                        done()
                    }, RESEND_TIMEOUT + 1000)
                    clock.tick(RESEND_TIMEOUT + 1000)
                })

                await sub.handleBroadcastMessage(msg1, sinon.stub().resolves(true))
                await sub.handleBroadcastMessage(msg4, sinon.stub().resolves(true))
                sub.emit('disconnected')
            })

            it('does not emit "gap" if different publishers', () => {
                const msg1 = msg
                const msg4 = createMsg(4, undefined, 3, 0, {}, 'anotherPublisherId')

                const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub())
                sub.on('gap', sinon.stub().throws())

                sub.handleBroadcastMessage(msg1, sinon.stub().resolves(true))
                sub.handleBroadcastMessage(msg4, sinon.stub().resolves(true))
            })

            it('emits "gap" if a gap is detected (same timestamp but different sequenceNumbers)', (done) => {
                const msg1 = msg
                const msg4 = createMsg(1, 4, 1, 3)

                const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub())
                sub.on('gap', (from, to, publisherId) => {
                    assert.equal(from.timestamp, 1) // cannot know the first missing message so there will be a duplicate received
                    assert.equal(from.sequenceNumber, 0)
                    assert.equal(to.timestamp, 1)
                    assert.equal(to.sequenceNumber, 3)
                    assert.equal(publisherId, 'publisherId')

                    sub.stop()
                    done()
                })

                sub.handleBroadcastMessage(msg1, sinon.stub().resolves(true))
                sub.handleBroadcastMessage(msg4, sinon.stub().resolves(true))
            })

            it('does not emit "gap" if a gap is not detected', () => {
                const msg1 = msg
                const msg2 = createMsg(2, undefined, 1)

                const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub())
                sub.on('gap', sinon.stub().throws())

                sub.handleBroadcastMessage(msg1, sinon.stub().resolves(true))
                sub.handleBroadcastMessage(msg2, sinon.stub().resolves(true))
            })

            it('does not emit "gap" if a gap is not detected (same timestamp but different sequenceNumbers)', () => {
                const msg1 = msg
                const msg2 = createMsg(1, 1, 1, 0)

                const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub())
                sub.on('gap', sinon.stub().throws())

                sub.handleBroadcastMessage(msg1, sinon.stub().resolves(true))
                sub.handleBroadcastMessage(msg2, sinon.stub().resolves(true))
            })
        })

        it('emits done after processing a message with the bye key', (done) => {
            const byeMsg = createMsg(1, undefined, null, null, {
                _bye: true,
            })
            const handler = sinon.stub()
            const sub = new Subscription(byeMsg.getStreamId(), byeMsg.getStreamPartition(), handler)
            sub.on('done', () => {
                assert(handler.calledOnce)
                done()
            })

            sub.handleBroadcastMessage(byeMsg, sinon.stub().resolves(true))
        })

        describe('decryption', () => {
            it('should read clear text content without trying to decrypt', (done) => {
                const msg1 = createMsg(1, 0, null, 0, {
                    foo: 'bar',
                })
                const sub = new Subscription(msg1.getStreamId(), msg1.getStreamPartition(), (content) => {
                    assert.deepStrictEqual(content, msg1.getParsedContent())
                    done()
                })
                return sub.handleBroadcastMessage(msg1, sinon.stub().resolves(true))
            })
            it('should decrypt encrypted content with the correct key', (done) => {
                const groupKey = crypto.randomBytes(32)
                const data = {
                    foo: 'bar',
                }
                const plaintext = Buffer.from(JSON.stringify(data), 'utf8')
                const ciphertext = EncryptionUtil.encrypt(plaintext, groupKey)
                const msg1 = createMsg(1, 0, null, 0, ciphertext, 'publisherId', '1', StreamMessage.ENCRYPTION_TYPES.AES)
                const sub = new Subscription(msg1.getStreamId(), msg1.getStreamPartition(), (content) => {
                    assert.deepStrictEqual(content, data)
                    done()
                }, {}, {
                    publisherId: groupKey,
                })
                return sub.handleBroadcastMessage(msg1, sinon.stub().resolves(true))
            })
            it('should not be able to decrypt with the wrong key', (done) => {
                const correctGroupKey = crypto.randomBytes(32)
                const wrongGroupKey = crypto.randomBytes(32)
                const data = {
                    foo: 'bar',
                }
                const plaintext = Buffer.from(JSON.stringify(data), 'utf8')
                const ciphertext = EncryptionUtil.encrypt(plaintext, correctGroupKey)
                const msg1 = createMsg(1, 0, null, 0, ciphertext, 'publisherId', '1', StreamMessage.ENCRYPTION_TYPES.AES)
                const sub = new Subscription(msg1.getStreamId(), msg1.getStreamPartition(), sinon.stub(), {}, {
                    publisherId: wrongGroupKey,
                })
                sub.on('error', (err) => {
                    assert.strictEqual(err.toString(), `Error: Unable to decrypt ${ciphertext}`)
                    done()
                })
                return sub.handleBroadcastMessage(msg1, sinon.stub().resolves(true))
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
                const plaintext1 = Buffer.concat([groupKey2, Buffer.from(JSON.stringify(data1), 'utf8')])
                const ciphertext1 = EncryptionUtil.encrypt(plaintext1, groupKey1)
                const plaintext2 = Buffer.from(JSON.stringify(data2), 'utf8')
                const ciphertext2 = EncryptionUtil.encrypt(plaintext2, groupKey2)
                const msg1 = createMsg(1, 0, null, 0, ciphertext1, 'publisherId', '1', StreamMessage.ENCRYPTION_TYPES.NEW_KEY_AND_AES)
                const msg2 = createMsg(2, 0, 1, 0, ciphertext2, 'publisherId', '1', StreamMessage.ENCRYPTION_TYPES.AES)
                let test1Ok = false
                const sub = new Subscription(msg1.getStreamId(), msg1.getStreamPartition(), (content) => {
                    if (JSON.stringify(content) === JSON.stringify(data1)) {
                        assert.deepStrictEqual(sub.groupKeys.publisherId, groupKey2)
                        test1Ok = true
                    } else if (test1Ok && JSON.stringify(content) === JSON.stringify(data2)) {
                        done()
                    }
                }, {}, {
                    publisherId: groupKey1,
                })
                await sub.handleBroadcastMessage(msg1, sinon.stub().resolves(true))
                return sub.handleBroadcastMessage(msg2, sinon.stub().resolves(true))
            })
        })
    })

    describe('handleError()', () => {
        it('emits an error event', (done) => {
            const err = new Error('Test error')
            const sub = new Subscription(
                msg.getStreamId(),
                msg.getStreamPartition(),
                sinon.stub().throws('Msg handler should not be called!'),
            )
            sub.on('error', (thrown) => {
                assert(err === thrown)
                done()
            })
            sub.handleError(err)
        })

        it('marks the message as received if an InvalidJsonError occurs, and continue normally on next message', (done) => {
            const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), (content, receivedMsg) => {
                if (receivedMsg.getTimestamp() === 3) {
                    sub.stop()
                    done()
                }
            })

            sub.on('gap', sinon.stub().throws('Should not emit gap!'))

            const msg1 = msg
            const msg3 = createMsg(3, undefined, 2)

            // Receive msg1 successfully
            sub.handleBroadcastMessage(msg1, sinon.stub().resolves(true))

            // Get notified of an invalid message
            const err = new Errors.InvalidJsonError(msg.getStreamId(), 'invalid json', 'test error msg', createMsg(2, undefined, 1))
            sub.handleError(err)

            // Receive msg3 successfully
            sub.handleBroadcastMessage(msg3, sinon.stub().resolves(true))
        })

        it('if an InvalidJsonError AND a gap occur, does not mark it as received and emits gap at the next message', async (done) => {
            const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub())

            sub.on('gap', (from, to, publisherId) => {
                assert.equal(from.timestamp, 1) // cannot know the first missing message so there will be a duplicate received
                assert.equal(from.sequenceNumber, 0)
                assert.equal(to.timestamp, 3)
                assert.equal(to.sequenceNumber, 0)
                assert.equal(publisherId, 'publisherId')

                sub.stop()
                done()
            })

            const msg1 = msg
            const msg4 = createMsg(4, undefined, 3)

            // Receive msg1 successfully
            await sub.handleBroadcastMessage(msg1, sinon.stub().resolves(true))

            // Get notified of invalid msg3 (msg2 is missing)
            const err = new Errors.InvalidJsonError(msg.getStreamId(), 'invalid json', 'test error msg', createMsg(3, undefined, 2))
            sub.handleError(err)

            // Receive msg4 and should emit gap
            sub.handleBroadcastMessage(msg4, sinon.stub().resolves(true))
        })
    })

    describe('getEffectiveResendOptions()', () => {
        describe('before messages have been received', () => {
            it('returns original resend options', () => {
                const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub(), {
                    from: {
                        timestamp: 1,
                        sequenceNumber: 0,
                    },
                    publisherId: 'publisherId',
                    msgChainId: '1',
                })
                assert.deepStrictEqual(sub.getEffectiveResendOptions(), {
                    from: {
                        timestamp: 1,
                        sequenceNumber: 0,
                    },
                    publisherId: 'publisherId',
                    msgChainId: '1',
                })
            })
        })
        describe('after messages have been received', () => {
            it('updates resend.from', async () => {
                const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub(), {
                    from: {
                        timestamp: 1,
                        sequenceNumber: 0,
                    },
                    publisherId: 'publisherId',
                    msgChainId: '1',
                })
                await sub.handleBroadcastMessage(createMsg(10), sinon.stub().resolves(true))
                assert.deepStrictEqual(sub.getEffectiveResendOptions(), {
                    from: {
                        timestamp: 10,
                        sequenceNumber: 0,
                    },
                    publisherId: 'publisherId',
                    msgChainId: '1',
                })
            })
            it('does not affect resend.last', () => {
                const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub(), {
                    last: 10,
                })
                sub.handleBroadcastMessage(msg, sinon.stub().resolves(true))
                assert.deepEqual(sub.getEffectiveResendOptions(), {
                    last: 10,
                })
            })
        })
    })

    describe('setState()', () => {
        it('updates the state', () => {
            const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub())
            sub.setState(Subscription.State.subscribed)
            assert.equal(sub.getState(), Subscription.State.subscribed)
        })
        it('fires an event', (done) => {
            const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub())
            sub.on(Subscription.State.subscribed, done)
            sub.setState(Subscription.State.subscribed)
        })
    })

    describe('handleResending()', () => {
        it('emits the resending event', (done) => {
            const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub())
            sub.on('resending', () => done())
            sub.setResending(true)
            sub.handleResending(ControlLayer.ResendResponseResending.create('streamId', 0, 'subId'))
        })
    })

    describe('handleResent()', () => {
        it('arms the Subscription to emit the resent event on last message (message handler completes BEFORE resent)', async (done) => {
            const handler = sinon.stub()
            const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), handler)
            sub.on('resent', () => done())
            sub.setResending(true)
            await sub.handleResentMessage(msg, sinon.stub().resolves(true))
            sub.handleResent(ControlLayer.ResendResponseResent.create('streamId', 0, 'subId'))
        })

        it('arms the Subscription to emit the resent event on last message (message handler completes AFTER resent)', async (done) => {
            const handler = sinon.stub()
            const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), handler)
            sub.on('resent', () => done())
            sub.setResending(true)
            sub.handleResentMessage(msg, sinon.stub().resolves(true))
            sub.handleResent(ControlLayer.ResendResponseResent.create('streamId', 0, 'subId'))
        })

        it('processes queued messages', async () => {
            const handler = sinon.stub()
            const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), handler)

            sub.setResending(true)
            await sub.handleBroadcastMessage(createMsg(2), sinon.stub().resolves(true))
            assert.equal(handler.callCount, 0)

            await sub.handleResentMessage(createMsg(1), sinon.stub().resolves(true))
            await sub.handleResent(ControlLayer.ResendResponseResent.create('streamId', 0, 'subId'))
            assert.equal(handler.callCount, 2) // 2 == 1 resent message + 1 queued message
        })

        describe('on error', () => {
            let stdError
            let sub

            beforeEach(() => {
                stdError = console.error
                console.error = sinon.stub()
            })

            afterEach(() => {
                console.error = stdError
                sub.stop()
            })

            it('cleans up the resend if event handler throws', async () => {
                const handler = sinon.stub()
                sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), handler)
                const error = new Error('test error, ignore')
                sub.on('resent', sinon.stub().throws(error))
                sub.setResending(true)
                await sub.handleResentMessage(msg, sinon.stub().resolves(true))

                await sub.handleResent(ControlLayer.ResendResponseResent.create('streamId', 0, 'subId'))
                assert(!sub.isResending())
            })
        })
    })

    describe('handleNoResend()', () => {
        it('emits the no_resend event', (done) => {
            const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub())
            sub.on('no_resend', () => done())
            sub.setResending(true)
            sub.handleNoResend(ControlLayer.ResendResponseNoResend.create('streamId', 0, 'subId'))
        })

        it('processes queued messages', async () => {
            const handler = sinon.stub()
            const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), handler)

            sub.setResending(true)
            await sub.handleBroadcastMessage(createMsg(2), sinon.stub().resolves(true))
            assert.equal(handler.callCount, 0)

            await sub.handleNoResend(ControlLayer.ResendResponseNoResend.create('streamId', 0, 'subId'))
            assert.equal(handler.callCount, 1)
        })

        describe('on error', () => {
            let stdError
            let sub

            beforeEach(() => {
                stdError = console.error
                console.error = sinon.stub()
            })

            afterEach(() => {
                console.error = stdError
                sub.stop()
            })

            it('cleans up the resend if event handler throws', async () => {
                sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub())
                const error = new Error('test error, ignore')
                sub.on('no_resend', sinon.stub()
                    .throws(error))
                sub.setResending(true)
                await sub.handleNoResend(ControlLayer.ResendResponseNoResend.create('streamId', 0, 'subId'))
                assert(!sub.isResending())
            })
        })
    })
})

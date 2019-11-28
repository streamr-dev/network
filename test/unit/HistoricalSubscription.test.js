import assert from 'assert'
import crypto from 'crypto'

import sinon from 'sinon'
import { ControlLayer, MessageLayer, Errors } from 'streamr-client-protocol'

import HistoricalSubscription from '../../src/HistoricalSubscription'
import InvalidSignatureError from '../../src/errors/InvalidSignatureError'
import VerificationFailedError from '../../src/errors/VerificationFailedError'
import EncryptionUtil from '../../src/EncryptionUtil'
import Subscription from '../../src/Subscription'

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

describe('HistoricalSubscription', () => {
    describe('message handling', () => {
        describe('handleBroadcastMessage()', () => {
            it('calls the message handler', () => {
                const sub = new HistoricalSubscription(msg.getStreamId(), msg.getStreamPartition(), (content, receivedMsg) => {
                    assert.deepEqual(content, msg.getParsedContent())
                    assert.equal(msg, receivedMsg)
                }, {
                    last: 1
                })
                return sub.handleResentMessage(msg, sinon.stub().resolves(true))
            })

            describe('on error', () => {
                let stdError
                let sub

                beforeEach(() => {
                    sub = new HistoricalSubscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub().throws('should not be called!'), {
                        last: 1
                    })
                    stdError = console.error
                    console.error = sinon.stub()
                })

                afterEach(() => {
                    console.error = stdError
                    sub.stop()
                })

                describe('when message verification returns false', () => {
                    it('does not call the message handler', async () => sub.handleResentMessage(msg, sinon.stub().resolves(false)))

                    it('prints to standard error stream', async () => {
                        await sub.handleResentMessage(msg, sinon.stub().resolves(false))
                        assert(console.error.calledWith(sinon.match.instanceOf(InvalidSignatureError)))
                    })

                    it('emits an error event', async (done) => {
                        sub.on('error', (err) => {
                            assert(err instanceof InvalidSignatureError)
                            done()
                        })
                        return sub.handleResentMessage(msg, sinon.stub().resolves(false))
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
                        return sub.handleResentMessage(msg, sinon.stub().throws(error))
                    })
                })

                describe('when message handler throws', () => {
                    it('emits an error event', async (done) => {
                        sub.on('error', (err) => {
                            assert.strictEqual(err.name, 'should not be called!')
                            done()
                        })
                        return sub.handleResentMessage(msg, sinon.stub().resolves(true))
                    })

                    it('prints to standard error stream', async (done) => {
                        sub.on('error', (err) => {
                            assert.strictEqual(err.name, 'should not be called!')
                            done()
                        })
                        return sub.handleResentMessage(msg, sinon.stub().resolves(true))
                    })
                })
            })

            it('calls the callback once for each message in order', (done) => {
                const msgs = [1, 2, 3, 4, 5].map((timestamp) => createMsg(
                    timestamp,
                    timestamp === 1 ? 0 : timestamp - 1,
                ))

                const received = []

                const sub = new HistoricalSubscription(msg.getStreamId(), msg.getStreamPartition(), (content, receivedMsg) => {
                    received.push(receivedMsg)
                    if (received.length === 5) {
                        assert.deepEqual(msgs, received)
                        done()
                    }
                }, {
                    last: 1
                })

                return Promise.all(msgs.map((m) => sub.handleResentMessage(m, sinon.stub().resolves(true))))
            })
        })

        describe('duplicate handling', () => {
            it('ignores re-received messages', async () => {
                const handler = sinon.stub()
                const sub = new HistoricalSubscription(msg.getStreamId(), msg.getStreamPartition(), handler, {
                    last: 1
                })

                await sub.handleResentMessage(msg, sinon.stub().resolves(true))
                await sub.handleResentMessage(msg, sinon.stub().resolves(true))
                assert.equal(handler.callCount, 1)
                sub.stop()
            })
        })

        describe('gap detection', () => {
            it('emits "gap" if a gap is detected', (done) => {
                const msg1 = msg
                const msg4 = createMsg(4, undefined, 3)

                const sub = new HistoricalSubscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub(), {
                    last: 1
                }, {}, 100, 100)
                sub.on('gap', (from, to, publisherId) => {
                    assert.equal(from.timestamp, 1)
                    assert.equal(from.sequenceNumber, 1)
                    assert.equal(to.timestamp, 3)
                    assert.equal(to.sequenceNumber, 0)
                    assert.equal(publisherId, 'publisherId')
                    setTimeout(() => {
                        sub.stop()
                        done()
                    }, 100)
                })

                sub.handleResentMessage(msg1, sinon.stub().resolves(true))
                sub.handleResentMessage(msg4, sinon.stub().resolves(true))
            })

            it('emits second "gap" after the first one if no missing message is received in between', (done) => {
                const msg1 = msg
                const msg4 = createMsg(4, undefined, 3)

                const sub = new HistoricalSubscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub(), {
                    last: 1
                }, {}, 100, 100)
                sub.on('gap', (from, to, publisherId) => {
                    sub.on('gap', (from2, to2, publisherId2) => {
                        assert.deepStrictEqual(from, from2)
                        assert.deepStrictEqual(to, to2)
                        assert.deepStrictEqual(publisherId, publisherId2)
                        sub.stop()
                        done()
                    })
                })

                sub.handleResentMessage(msg1, sinon.stub().resolves(true))
                sub.handleResentMessage(msg4, sinon.stub().resolves(true))
            })

            it('does not emit second "gap" after the first one if the missing messages are received in between', (done) => {
                const msg1 = msg
                const msg2 = createMsg(2, undefined, 1)
                const msg3 = createMsg(3, undefined, 2)
                const msg4 = createMsg(4, undefined, 3)

                const sub = new HistoricalSubscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub(), {
                    last: 1
                }, {}, 100, 100)
                sub.on('gap', () => {
                    sub.handleResentMessage(msg2, sinon.stub().resolves(true))
                    sub.handleResentMessage(msg3, sinon.stub().resolves(true)).then(() => {
                    })
                    sub.on('gap', () => { throw new Error('should not emit second gap') })
                    setTimeout(() => {
                        sub.stop()
                        done()
                    }, 100 + 1000)
                })

                sub.handleResentMessage(msg1, sinon.stub().resolves(true))
                sub.handleResentMessage(msg4, sinon.stub().resolves(true))
            })

            it('does not emit second "gap" if gets unsubscribed', async (done) => {
                const msg1 = msg
                const msg4 = createMsg(4, undefined, 3)

                const sub = new HistoricalSubscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub(), {
                    last: 1
                }, {}, 100, 100)
                sub.once('gap', () => {
                    sub.emit('unsubscribed')
                    sub.on('gap', () => { throw new Error('should not emit second gap') })
                    setTimeout(() => {
                        sub.stop()
                        done()
                    }, 100 + 1000)
                })

                sub.handleResentMessage(msg1, sinon.stub().resolves(true))
                sub.handleResentMessage(msg4, sinon.stub().resolves(true))
            })

            it('does not emit second "gap" if gets disconnected', async (done) => {
                const msg1 = msg
                const msg4 = createMsg(4, undefined, 3)

                const sub = new HistoricalSubscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub(), {
                    last: 1
                }, {}, 100, 100)
                sub.once('gap', () => {
                    sub.emit('disconnected')
                    sub.on('gap', () => { throw new Error('should not emit second gap') })
                    setTimeout(() => {
                        sub.stop()
                        done()
                    }, 100 + 1000)
                })

                sub.handleResentMessage(msg1, sinon.stub().resolves(true))
                sub.handleResentMessage(msg4, sinon.stub().resolves(true))
            })

            it('does not emit "gap" if different publishers', () => {
                const msg1 = msg
                const msg1b = createMsg(1, 0, undefined, 0, {}, 'anotherPublisherId')

                const sub = new HistoricalSubscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub(), {
                    last: 1
                })
                sub.on('gap', () => {
                    throw new Error('unexpected gap')
                })

                sub.handleResentMessage(msg1, sinon.stub().resolves(true))
                sub.handleResentMessage(msg1b, sinon.stub().resolves(true))
            })

            it('emits "gap" if a gap is detected (same timestamp but different sequenceNumbers)', (done) => {
                const msg1 = msg
                const msg4 = createMsg(1, 4, 1, 3)

                const sub = new HistoricalSubscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub(), {
                    last: 1
                }, {}, 100, 100)
                sub.on('gap', (from, to, publisherId) => {
                    assert.equal(from.timestamp, 1) // cannot know the first missing message so there will be a duplicate received
                    assert.equal(from.sequenceNumber, 1)
                    assert.equal(to.timestamp, 1)
                    assert.equal(to.sequenceNumber, 3)
                    assert.equal(publisherId, 'publisherId')
                    setTimeout(() => {
                        sub.stop()
                        done()
                    }, 100)
                })

                sub.handleResentMessage(msg1, sinon.stub().resolves(true))
                sub.handleResentMessage(msg4, sinon.stub().resolves(true))
            })

            it('does not emit "gap" if a gap is not detected', () => {
                const msg1 = msg
                const msg2 = createMsg(2, undefined, 1)

                const sub = new HistoricalSubscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub(), {
                    last: 1
                })
                sub.on('gap', sinon.stub().throws())

                sub.handleResentMessage(msg1, sinon.stub().resolves(true))
                sub.handleResentMessage(msg2, sinon.stub().resolves(true))
            })

            it('does not emit "gap" if a gap is not detected (same timestamp but different sequenceNumbers)', () => {
                const msg1 = msg
                const msg2 = createMsg(1, 1, 1, 0)

                const sub = new HistoricalSubscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub(), {
                    last: 1
                })
                sub.on('gap', sinon.stub().throws())

                sub.handleResentMessage(msg1, sinon.stub().resolves(true))
                sub.handleResentMessage(msg2, sinon.stub().resolves(true))
            })

            describe('ordering util', () => {
                it('handles messages in the order in which they arrive if no ordering util', async () => {
                    const msg1 = msg
                    const msg2 = createMsg(2, 0, 1, 0)
                    const msg3 = createMsg(3, 0, 2, 0)
                    const msg4 = createMsg(4, 0, 3, 0)
                    const received = []

                    const sub = new HistoricalSubscription(msg.getStreamId(), msg.getStreamPartition(), (content, receivedMsg) => {
                        received.push(receivedMsg)
                    }, {
                        last: 1
                    }, {}, 100, 100, false)
                    sub.on('gap', sinon.stub().throws())

                    await sub.handleResentMessage(msg1, sinon.stub().resolves(true))
                    await sub.handleResentMessage(msg2, sinon.stub().resolves(true))
                    await sub.handleResentMessage(msg4, sinon.stub().resolves(true))
                    await sub.handleResentMessage(msg2, sinon.stub().resolves(true))
                    await sub.handleResentMessage(msg3, sinon.stub().resolves(true))
                    await sub.handleResentMessage(msg1, sinon.stub().resolves(true))

                    assert.deepStrictEqual(received, [msg1, msg2, msg4, msg2, msg3, msg1])
                })
                it('handles messages in order without duplicates if ordering util is set', async () => {
                    const msg1 = msg
                    const msg2 = createMsg(2, 0, 1, 0)
                    const msg3 = createMsg(3, 0, 2, 0)
                    const msg4 = createMsg(4, 0, 3, 0)
                    const received = []

                    const sub = new HistoricalSubscription(msg.getStreamId(), msg.getStreamPartition(), (content, receivedMsg) => {
                        received.push(receivedMsg)
                    }, {
                        last: 1
                    })

                    await sub.handleResentMessage(msg1, sinon.stub().resolves(true))
                    await sub.handleResentMessage(msg2, sinon.stub().resolves(true))
                    await sub.handleResentMessage(msg4, sinon.stub().resolves(true))
                    await sub.handleResentMessage(msg2, sinon.stub().resolves(true))
                    await sub.handleResentMessage(msg3, sinon.stub().resolves(true))
                    await sub.handleResentMessage(msg1, sinon.stub().resolves(true))

                    assert.deepStrictEqual(received, [msg1, msg2, msg3, msg4])
                })
            })
        })

        it('emits done after processing a message with the bye key', (done) => {
            const byeMsg = createMsg(1, undefined, null, null, {
                _bye: true,
            })
            const handler = sinon.stub()
            const sub = new HistoricalSubscription(byeMsg.getStreamId(), byeMsg.getStreamPartition(), handler, {
                last: 1
            })
            sub.on('done', () => {
                assert(handler.calledOnce)
                done()
            })

            sub.handleResentMessage(byeMsg, sinon.stub().resolves(true))
        })

        describe('decryption', () => {
            it('should read clear text content without trying to decrypt', (done) => {
                const msg1 = createMsg(1, 0, null, 0, {
                    foo: 'bar',
                })
                const sub = new HistoricalSubscription(msg1.getStreamId(), msg1.getStreamPartition(), (content) => {
                    assert.deepStrictEqual(content, msg1.getParsedContent())
                    done()
                }, {
                    last: 1
                })
                return sub.handleResentMessage(msg1, sinon.stub().resolves(true))
            })
            it('should decrypt encrypted content with the correct key', (done) => {
                const groupKey = crypto.randomBytes(32)
                const data = {
                    foo: 'bar',
                }
                const plaintext = Buffer.from(JSON.stringify(data), 'utf8')
                const ciphertext = EncryptionUtil.encrypt(plaintext, groupKey)
                const msg1 = createMsg(1, 0, null, 0, ciphertext, 'publisherId', '1', StreamMessage.ENCRYPTION_TYPES.AES)
                const sub = new HistoricalSubscription(msg1.getStreamId(), msg1.getStreamPartition(), (content) => {
                    assert.deepStrictEqual(content, data)
                    done()
                }, {
                    last: 1
                }, {
                    publisherId: groupKey,
                })
                return sub.handleResentMessage(msg1, sinon.stub().resolves(true))
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
                const sub = new HistoricalSubscription(msg1.getStreamId(), msg1.getStreamPartition(), sinon.stub(), {
                    last: 1
                }, {
                    publisherId: wrongGroupKey,
                })
                sub.on('error', (err) => {
                    assert.strictEqual(err.toString(), `Error: Unable to decrypt ${ciphertext}`)
                    done()
                })
                return sub.handleResentMessage(msg1, sinon.stub().resolves(true))
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
                const sub = new HistoricalSubscription(msg1.getStreamId(), msg1.getStreamPartition(), (content) => {
                    if (JSON.stringify(content) === JSON.stringify(data1)) {
                        assert.deepStrictEqual(sub.groupKeys.publisherId, groupKey2)
                        test1Ok = true
                    } else if (test1Ok && JSON.stringify(content) === JSON.stringify(data2)) {
                        done()
                    }
                }, {
                    last: 1
                }, {
                    publisherId: groupKey1,
                })
                await sub.handleResentMessage(msg1, sinon.stub().resolves(true))
                return sub.handleResentMessage(msg2, sinon.stub().resolves(true))
            })
        })
    })

    describe('handleError()', () => {
        it('emits an error event', (done) => {
            const err = new Error('Test error')
            const sub = new HistoricalSubscription(
                msg.getStreamId(),
                msg.getStreamPartition(),
                sinon.stub().throws('Msg handler should not be called!'), {
                    last: 1
                }
            )
            sub.on('error', (thrown) => {
                assert(err === thrown)
                done()
            })
            sub.handleError(err)
        })

        it('marks the message as received if an InvalidJsonError occurs, and continue normally on next message', async (done) => {
            const sub = new HistoricalSubscription(msg.getStreamId(), msg.getStreamPartition(), (content, receivedMsg) => {
                if (receivedMsg.getTimestamp() === 3) {
                    sub.stop()
                    done()
                }
            }, {
                last: 1
            })

            sub.on('gap', sinon.stub().throws('Should not emit gap!'))

            const msg1 = msg
            const msg3 = createMsg(3, undefined, 2)

            // Receive msg1 successfully
            await sub.handleResentMessage(msg1, sinon.stub().resolves(true))

            // Get notified of an invalid message
            const err = new Errors.InvalidJsonError(msg.getStreamId(), 'invalid json', 'test error msg', createMsg(2, undefined, 1))
            sub.handleError(err)

            // Receive msg3 successfully
            await sub.handleResentMessage(msg3, sinon.stub().resolves(true))
        })

        it('if an InvalidJsonError AND a gap occur, does not mark it as received and emits gap at the next message', async (done) => {
            const sub = new HistoricalSubscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub(), {
                last: 1
            }, {}, 100, 100)

            sub.on('gap', (from, to, publisherId) => {
                assert.equal(from.timestamp, 1) // cannot know the first missing message so there will be a duplicate received
                assert.equal(from.sequenceNumber, 1)
                assert.equal(to.timestamp, 3)
                assert.equal(to.sequenceNumber, 0)
                assert.equal(publisherId, 'publisherId')
                setTimeout(() => {
                    sub.stop()
                    done()
                }, 100)
            })

            const msg1 = msg
            const msg4 = createMsg(4, undefined, 3)

            // Receive msg1 successfully
            await sub.handleResentMessage(msg1, sinon.stub().resolves(true))

            // Get notified of invalid msg3 (msg2 is missing)
            const err = new Errors.InvalidJsonError(msg.getStreamId(), 'invalid json', 'test error msg', createMsg(3, undefined, 2))
            sub.handleError(err)

            // Receive msg4 and should emit gap
            await sub.handleResentMessage(msg4, sinon.stub().resolves(true))
        })
    })

    describe('setState()', () => {
        it('updates the state', () => {
            const sub = new HistoricalSubscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub(), {
                last: 1
            })
            sub.setState(Subscription.State.subscribed)
            assert.equal(sub.getState(), Subscription.State.subscribed)
        })
        it('fires an event', (done) => {
            const sub = new HistoricalSubscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub(), {
                last: 1
            })
            sub.on(Subscription.State.subscribed, done)
            sub.setState(Subscription.State.subscribed)
        })
    })

    describe('handleResending()', () => {
        it('emits the resending event', (done) => {
            const sub = new HistoricalSubscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub(), {
                last: 1
            })
            sub.addPendingResendRequestId('requestId')
            sub.on('resending', () => done())
            sub.handleResending(ControlLayer.ResendResponseResending.create('streamId', 0, 'requestId'))
        })
    })

    describe('handleResent()', () => {
        it('arms the Subscription to emit the resent event on last message (message handler completes BEFORE resent)', async (done) => {
            const handler = sinon.stub()
            const sub = new HistoricalSubscription(msg.getStreamId(), msg.getStreamPartition(), handler, {
                last: 1
            })
            sub.addPendingResendRequestId('requestId')
            sub.on('resent', () => done())
            await sub.handleResentMessage(msg, sinon.stub().resolves(true))
            sub.handleResent(ControlLayer.ResendResponseResent.create('streamId', 0, 'requestId'))
        })

        it('arms the Subscription to emit the resent event on last message (message handler completes AFTER resent)', async (done) => {
            const handler = sinon.stub()
            const sub = new HistoricalSubscription(msg.getStreamId(), msg.getStreamPartition(), handler, {
                last: 1
            })
            sub.addPendingResendRequestId('requestId')
            sub.on('resent', () => done())
            sub.handleResentMessage(msg, sinon.stub().resolves(true))
            sub.handleResent(ControlLayer.ResendResponseResent.create('streamId', 0, 'requestId'))
        })
    })

    describe('handleNoResend()', () => {
        it('emits the no_resend event', (done) => {
            const sub = new HistoricalSubscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub(), {
                last: 1
            })
            sub.addPendingResendRequestId('requestId')
            sub.on('no_resend', () => done())
            sub.handleNoResend(ControlLayer.ResendResponseNoResend.create('streamId', 0, 'requestId'))
        })
    })
})

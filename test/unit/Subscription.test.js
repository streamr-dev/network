import assert from 'assert'
import sinon from 'sinon'
import { MessageLayer, Errors } from 'streamr-client-protocol'
import Subscription from '../../src/Subscription'

const { StreamMessage } = MessageLayer

const createMsg = (
    timestamp = 1, sequenceNumber = 0, prevTimestamp = null,
    prevSequenceNumber = 0, content = {}, publisherId = 'publisherId', msgChainId = '1',
) => {
    const prevMsgRef = prevTimestamp ? [prevTimestamp, prevSequenceNumber] : null
    return StreamMessage.create(
        ['streamId', 0, timestamp, sequenceNumber, publisherId, msgChainId], prevMsgRef,
        StreamMessage.CONTENT_TYPES.JSON, content, StreamMessage.SIGNATURE_TYPES.NONE,
    )
}

const msg = createMsg()

describe('Subscription', () => {
    describe('handleMessage()', () => {
        it('calls the message handler', (done) => {
            const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), (content, receivedMsg) => {
                assert.deepEqual(content, msg.getParsedContent())
                assert.equal(msg, receivedMsg)
                done()
            })
            sub.handleMessage(msg)
        })

        it('calls the callback once for each message in order', (done) => {
            const msgs = [1, 2, 3, 4, 5].map((timestamp) => createMsg(
                timestamp,
                timestamp === 1 ? 0 : timestamp - 1,
            ))

            const received = []

            const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), (content, receivedMsg) => {
                received.push(receivedMsg)
                if (received.length === 5) {
                    assert.deepEqual(msgs, received)
                    done()
                }
            })

            msgs.forEach((m) => sub.handleMessage(m))
        })

        it('queues messages during resending', () => {
            const handler = sinon.stub()
            const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), handler)

            sub.setResending(true)
            sub.handleMessage(msg)
            assert.equal(handler.callCount, 0)
            assert.equal(sub.queue.length, 1)
        })

        it('always processes messages if isResend == true', () => {
            const handler = sinon.stub()
            const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), handler)

            sub.setResending(true)
            sub.handleMessage(msg, true)
            assert.equal(handler.callCount, 1)
        })

        describe('duplicate handling', () => {
            it('ignores re-received messages', (done) => {
                const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), () => {
                    done()
                })

                sub.handleMessage(msg)
                sub.handleMessage(msg)
            })
            it('ignores re-received messages even with resending flag', (done) => {
                const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), () => {
                    done()
                })

                sub.handleMessage(msg)
                sub.handleMessage(msg, true)
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
                    done()
                })

                sub.handleMessage(msg1)
                sub.handleMessage(msg4)
            })
            it('does not emit "gap" if different publishers', () => {
                const msg1 = msg
                const msg4 = createMsg(4, undefined, 3, 0, {}, 'anotherPublisherId')

                const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub())
                sub.on('gap', sinon.stub().throws())

                sub.handleMessage(msg1)
                sub.handleMessage(msg4)
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
                    done()
                })

                sub.handleMessage(msg1)
                sub.handleMessage(msg4)
            })
            it('does not emit "gap" if a gap is not detected', () => {
                const msg1 = msg
                const msg2 = createMsg(2, undefined, 1)

                const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub())
                sub.on('gap', sinon.stub().throws())

                sub.handleMessage(msg1)
                sub.handleMessage(msg2)
            })
            it('does not emit "gap" if a gap is not detected (same timestamp but different sequenceNumbers)', () => {
                const msg1 = msg
                const msg2 = createMsg(1, 1, 1, 0)

                const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub())
                sub.on('gap', sinon.stub().throws())

                sub.handleMessage(msg1)
                sub.handleMessage(msg2)
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

            sub.handleMessage(byeMsg)
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
                    done()
                }
            })

            sub.on('gap', sinon.stub().throws('Should not emit gap!'))

            const msg1 = msg
            const msg3 = createMsg(3, undefined, 2)

            // Receive msg1 successfully
            sub.handleMessage(msg1)

            // Get notified of an invalid message
            const err = new Errors.InvalidJsonError(msg.getStreamId(), 'invalid json', 'test error msg', createMsg(2, undefined, 1))
            sub.handleError(err)

            // Receive msg3 successfully
            sub.handleMessage(msg3)
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
            it('updates resend.from', () => {
                const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), sinon.stub(), {
                    from: {
                        timestamp: 1,
                        sequenceNumber: 0,
                    },
                    publisherId: 'publisherId',
                    msgChainId: '1',
                })
                sub.handleMessage(createMsg(10))
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
                sub.handleMessage(msg)
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

    describe('event handling', () => {
        describe('resent', () => {
            it('processes queued messages', () => {
                const handler = sinon.stub()
                const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), handler)

                sub.setResending(true)
                sub.handleMessage(msg)
                assert.equal(handler.callCount, 0)

                sub.emit('resent')
                assert.equal(handler.callCount, 1)
            })
        })

        describe('no_resend', () => {
            it('processes queued messages', () => {
                const handler = sinon.stub()
                const sub = new Subscription(msg.getStreamId(), msg.getStreamPartition(), handler)

                sub.setResending(true)
                sub.handleMessage(msg)
                assert.equal(handler.callCount, 0)

                sub.emit('no_resend')
                assert.equal(handler.callCount, 1)
            })
        })
    })
})

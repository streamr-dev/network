import assert from 'assert'
import sinon from 'sinon'

import { StreamMessage, Errors } from 'streamr-client-protocol'

import Subscription from '../../src/Subscription'

const createMsg = (offset = 1, previousOffset = null, content = {}) => new StreamMessage(
    'streamId',
    0,
    Date.now(),
    0,
    offset,
    previousOffset,
    StreamMessage.CONTENT_TYPES.JSON,
    content,
)

const msg = createMsg()

describe('Subscription', () => {
    describe('handleMessage()', () => {
        it('calls the message handler', (done) => {
            const sub = new Subscription(msg.streamId, msg.streamPartition, 'apiKey', (content, receivedMsg) => {
                assert.deepEqual(content, msg.getParsedContent())
                assert.equal(msg, receivedMsg)
                done()
            })
            sub.handleMessage(msg)
        })

        it('calls the callback once for each message in order', (done) => {
            const msgs = [1, 2, 3, 4, 5].map((offset) => createMsg(
                offset,
                offset === 1 ? null : offset - 1,
            ))

            const received = []

            const sub = new Subscription(msg.streamId, msg.streamPartition, 'apiKey', (content, receivedMsg) => {
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
            const sub = new Subscription(msg.streamId, msg.streamPartition, 'apiKey', handler)

            sub.setResending(true)
            sub.handleMessage(msg)
            assert.equal(handler.callCount, 0)
            assert.equal(sub.queue.length, 1)
        })

        it('always processes messages if isResend == true', () => {
            const handler = sinon.stub()
            const sub = new Subscription(msg.streamId, msg.streamPartition, 'apiKey', handler)

            sub.setResending(true)
            sub.handleMessage(msg, true)
            assert.equal(handler.callCount, 1)
        })

        describe('duplicate handling', () => {
            it('ignores re-received messages', (done) => {
                const sub = new Subscription(msg.streamId, msg.streamPartition, 'apiKey', () => {
                    done()
                })

                sub.handleMessage(msg)
                sub.handleMessage(msg)
            })
            it('ignores re-received messages even with resending flag', (done) => {
                const sub = new Subscription(msg.streamId, msg.streamPartition, 'apiKey', () => {
                    done()
                })

                sub.handleMessage(msg)
                sub.handleMessage(msg, true)
            })
        })

        describe('gap detection', () => {
            it('emits "gap" if a gap is detected', (done) => {
                const msg1 = msg
                const msg4 = createMsg(4, 3)

                const sub = new Subscription(msg.streamId, msg.streamPartition, 'apiKey', sinon.stub())
                sub.on('gap', (from, to) => {
                    assert.equal(from, 2)
                    assert.equal(to, 3)
                    done()
                })

                sub.handleMessage(msg1)
                sub.handleMessage(msg4)
            })

            it('does not emit "gap" if a gap is not detected', () => {
                const msg1 = msg
                const msg2 = createMsg(2, 1)

                const sub = new Subscription(msg.streamId, msg.streamPartition, 'apiKey', sinon.stub())
                sub.on('gap', sinon.stub().throws())

                sub.handleMessage(msg1)
                sub.handleMessage(msg2)
            })
        })

        it('emits done after processing a message with the bye key', (done) => {
            const byeMsg = createMsg(1, null, {
                _bye: true,
            })
            const handler = sinon.stub()
            const sub = new Subscription(byeMsg.streamId, byeMsg.streamPartition, 'apiKey', handler)
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
                msg.streamId,
                msg.streamPartition,
                'apiKey',
                sinon.stub().throws('Msg handler should not be called!'),
            )
            sub.on('error', (thrown) => {
                assert(err === thrown)
                done()
            })
            sub.handleError(err)
        })

        it('marks the message as received if an InvalidJsonError occurs, and continue normally on next message', (done) => {
            const sub = new Subscription(msg.streamId, msg.streamPartition, 'apiKey', (content, receivedMsg) => {
                if (receivedMsg.offset === 3) {
                    done()
                }
            })

            sub.on('gap', sinon.stub().throws('Should not emit gap!'))

            const msg1 = msg
            const msg3 = createMsg(3, 2)

            // Receive msg1 successfully
            sub.handleMessage(msg1)

            // Get notified of an invalid message
            const err = new Errors.InvalidJsonError(msg.streamId, 'invalid json', 'test error msg', 2, 1)
            sub.handleError(err)

            // Receive msg3 successfully
            sub.handleMessage(msg3)
        })
    })

    describe('getEffectiveResendOptions()', () => {
        describe('before messages have been received', () => {
            it('returns original resend options', () => {
                const sub = new Subscription(msg.streamId, msg.streamPartition, 'apiKey', sinon.stub(), {
                    resend_all: true,
                })
                assert.equal(sub.getEffectiveResendOptions().resend_all, true)
            })
        })
        describe('after messages have been received', () => {
            it('transforms resend_all to resend_from', () => {
                const sub = new Subscription(msg.streamId, msg.streamPartition, 'apiKey', sinon.stub(), {
                    resend_all: true,
                })
                sub.handleMessage(msg)
                assert.deepEqual(sub.getEffectiveResendOptions(), {
                    resend_from: 2,
                })
            })
            it('updates resend_from', () => {
                const sub = new Subscription(msg.streamId, msg.streamPartition, 'apiKey', sinon.stub(), {
                    resend_from: 1,
                })
                sub.handleMessage(createMsg(10))
                assert.deepEqual(sub.getEffectiveResendOptions(), {
                    resend_from: 11,
                })
            })
            it('transforms resend_from_time to resend_from', () => {
                const sub = new Subscription(msg.streamId, msg.streamPartition, 'apiKey', sinon.stub(), {
                    resend_from_time: Date.now(),
                })
                sub.handleMessage(createMsg(10))
                assert.deepEqual(sub.getEffectiveResendOptions(), {
                    resend_from: 11,
                })
            })
            it('does not affect resend_last', () => {
                const sub = new Subscription(msg.streamId, msg.streamPartition, 'apiKey', sinon.stub(), {
                    resend_last: 10,
                })
                sub.handleMessage(msg)
                assert.deepEqual(sub.getEffectiveResendOptions(), {
                    resend_last: 10,
                })
            })
        })
    })

    describe('setState()', () => {
        it('updates the state', () => {
            const sub = new Subscription(msg.streamId, msg.streamPartition, 'apiKey', sinon.stub())
            sub.setState(Subscription.State.subscribed)
            assert.equal(sub.getState(), Subscription.State.subscribed)
        })
        it('fires an event', (done) => {
            const sub = new Subscription(msg.streamId, msg.streamPartition, 'apiKey', sinon.stub())
            sub.on(Subscription.State.subscribed, done)
            sub.setState(Subscription.State.subscribed)
        })
    })

    describe('event handling', () => {
        describe('resent', () => {
            it('processes queued messages', () => {
                const handler = sinon.stub()
                const sub = new Subscription(msg.streamId, msg.streamPartition, 'apiKey', handler)

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
                const sub = new Subscription(msg.streamId, msg.streamPartition, 'apiKey', handler)

                sub.setResending(true)
                sub.handleMessage(msg)
                assert.equal(handler.callCount, 0)

                sub.emit('no_resend')
                assert.equal(handler.callCount, 1)
            })
        })
    })
})

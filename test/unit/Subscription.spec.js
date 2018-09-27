import assert from 'assert'
import sinon from 'sinon'
import Subscription from '../../src/Subscription'
import InvalidJsonError from '../../src/errors/InvalidJsonError'

describe('Subscription', () => {
    describe('handleMessage', () => {
        it('calls the message handler', (done) => {
            const msg = {
                offset: 1,
                previousOffset: null,
                content: {},
            }

            const sub = new Subscription('streamId', 0, 'apiKey', (content, receivedMsg) => {
                assert.equal(content, msg.content)
                assert.deepEqual(msg, receivedMsg)
                done()
            })

            sub.handleMessage(msg)
        })

        it('emits "gap" if a gap is detected', (done) => {
            const msg1 = {
                offset: 1,
                previousOffset: null,
                content: {},
            }

            const msg4 = {
                offset: 4,
                previousOffset: 3,
                content: {},
            }

            const sub = new Subscription('streamId', 0, 'apiKey', sinon.stub())
            sub.on('gap', (from, to) => {
                assert.equal(from, 2)
                assert.equal(to, 3)
                done()
            })

            sub.handleMessage(msg1)
            sub.handleMessage(msg4)
        })
    })

    describe('handleError', () => {
        it('emits an error event', (done) => {
            const err = new Error('Test error')
            const sub = new Subscription('streamId', 0, 'apiKey', sinon.stub().throws('Msg handler should not be called!'))
            sub.on('error', (thrown) => {
                assert(err === thrown)
                done()
            })
            sub.handleError(err)
        })

        it('marks the message as received if an InvalidJsonError occurs, and continue normally on next message', (done) => {
            const sub = new Subscription('streamId', 0, 'apiKey', (content, msg) => {
                if (msg.offset === 3) {
                    done()
                }
            })

            sub.on('gap', sinon.stub().throws('Should not emit gap!'))

            const msg1 = {
                offset: 1,
                previousOffset: null,
                content: {},
            }
            const msg3 = {
                offset: 3,
                previousOffset: 2,
                content: {},
            }

            // Receive msg1 successfully
            sub.handleMessage(msg1)

            // Get notified of an invalid message
            const err = new InvalidJsonError('streamId', 'invalid json', 'test error msg', 2, 1)
            sub.handleError(err)

            // Receive msg3 successfully
            sub.handleMessage(msg3)
        })
    })
})

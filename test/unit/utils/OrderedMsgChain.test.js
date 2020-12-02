import assert from 'assert'

import shuffle from 'array-shuffle'

import OrderedMsgChain from '../../../src/utils/OrderedMsgChain'
import StreamMessage from '../../../src/protocol/message_layer/StreamMessage'
import GapFillFailedError from '../../../src/errors/GapFillFailedError'
import MessageID from '../../../src/protocol/message_layer/MessageID'
import MessageRef from '../../../src/protocol/message_layer/MessageRef'

const createMsg = (
    timestamp = 1, sequenceNumber = 0, prevTimestamp = null,
    prevSequenceNumber = 0, content = {}, publisherId = 'publisherId', msgChainId = 'msgChainId',
) => {
    const prevMsgRef = prevTimestamp ? new MessageRef(prevTimestamp, prevSequenceNumber) : null
    return new StreamMessage({
        messageId: new MessageID('streamId', 0, timestamp, sequenceNumber, publisherId, msgChainId),
        prevMsgRef,
        content,
    })
}

describe('OrderedMsgChain', () => {
    const msg1 = createMsg(1, 0)
    const msg2 = createMsg(2, 0, 1, 0)
    const msg3 = createMsg(3, 0, 2, 0)
    const msg4 = createMsg(4, 0, 3, 0)
    const msg5 = createMsg(5, 0, 4, 0)
    const msg6 = createMsg(6, 0, 5, 0)
    let util

    afterEach(() => {
        util.clearGap()
    })

    it('handles ordered messages in order', () => {
        const received = []
        util = new OrderedMsgChain('publisherId', 'msgChainId', (msg) => {
            received.push(msg)
        }, () => {
            throw new Error('Unexpected gap')
        })
        util.add(msg1)
        util.add(msg2)
        util.add(msg3)
        assert.deepStrictEqual(received, [msg1, msg2, msg3])
    })

    it('drops duplicates', () => {
        const received = []
        util = new OrderedMsgChain('publisherId', 'msgChainId', (msg) => {
            received.push(msg)
        }, () => {
            throw new Error('Unexpected gap')
        })
        util.add(msg1)
        util.add(msg1)
        util.add(msg2)
        util.add(msg1)
        assert.deepStrictEqual(received, [msg1, msg2])
    })

    it('calls the gap handler', (done) => {
        const received = []
        util = new OrderedMsgChain('publisherId', 'msgChainId', (msg) => {
            received.push(msg)
        }, (from, to, publisherId, msgChainId) => {
            assert.deepStrictEqual(received, [msg1, msg2])
            assert.strictEqual(from.timestamp, msg2.getMessageRef().timestamp)
            assert.strictEqual(from.sequenceNumber, msg2.getMessageRef().sequenceNumber + 1)
            assert.deepStrictEqual(to, msg5.prevMsgRef)
            assert.strictEqual(publisherId, 'publisherId')
            assert.strictEqual(msgChainId, 'msgChainId')
            clearInterval(util.gap)
            done()
        }, 50)
        util.add(msg1)
        util.add(msg2)
        util.add(msg5)
    })

    it('handles unordered messages in order', () => {
        const received = []
        util = new OrderedMsgChain('publisherId', 'msgChainId', (msg) => {
            received.push(msg)
        }, () => {})
        util.add(msg1)
        util.add(msg2)
        util.add(msg5)
        util.add(msg3)
        util.add(msg4)
        assert.deepStrictEqual(received, [msg1, msg2, msg3, msg4, msg5])
    })

    it('handles unchained messages in the order in which they arrive if they are newer', () => {
        const m2 = createMsg(4, 0)
        const m3 = createMsg(17, 0)
        const m4 = createMsg(7, 0)
        const received = []
        util = new OrderedMsgChain('publisherId', 'msgChainId', (msg) => {
            received.push(msg)
        }, () => {})
        util.add(msg1)
        util.add(m2)
        util.add(m3)
        util.add(m4)
        assert.deepStrictEqual(received, [msg1, m2, m3])
    })

    it('does not call the gap handler (scheduled but resolved before timeout)', () => {
        const received = []
        util = new OrderedMsgChain('publisherId', 'msgChainId', (msg) => {
            received.push(msg)
        }, () => {
            throw new Error('Unexpected gap')
        }, 10000)
        util.add(msg1)
        util.add(msg5)
        util.add(msg4)
        util.add(msg3)
        util.add(msg2)
        assert.deepStrictEqual(received, [msg1, msg2, msg3, msg4, msg5])
    })

    it('does not call the gap handler a second time if explicitly cleared', (done) => {
        let counter = 0
        util = new OrderedMsgChain('publisherId', 'msgChainId', () => {}, () => {
            if (counter === 0) {
                counter += 1
                util.clearGap()
                setTimeout(done, 1000)
            } else {
                throw new Error('Unexpected call to the gap handler')
            }
        }, 100, 100)
        util.add(msg1)
        util.add(msg3)
    })

    it('can handle multiple gaps', (done) => {
        const msgs = []
        util = new OrderedMsgChain('publisherId', 'msgChainId', (msg) => {
            msgs.push(msg)
            if (msgs.length === 5) {
                assert.deepStrictEqual(msgs, [msg1, msg2, msg3, msg4, msg5])
                done()
            }
        }, (from, to) => {
            if (to.timestamp === 2) {
                setTimeout(() => {
                    util.add(msg2)
                }, 25)
            }
            if (to.timestamp === 4) {
                util.add(msg4)
            }
        }, 100, 100)
        util.on('error', done)

        util.add(msg1)
        // missing msg2
        util.add(msg3)
        // missing msg4
        util.add(msg5)
    })

    it('can force-fill multiple gaps', (done) => {
        const msgs = []
        const gapHandler = jest.fn((from, to) => {
            if (to.timestamp === 2) {
                setTimeout(() => {
                    util.markMessageExplicitly(msg2)
                }, 35)
            }
            if (to.timestamp === 4) {
                setTimeout(() => {
                    util.markMessageExplicitly(msg4)
                }, 15)
            }
        })

        util = new OrderedMsgChain('publisherId', 'msgChainId', (msg) => {
            msgs.push(msg)
            if (msgs[msgs.length - 1].getMessageRef().timestamp === 5) {
                assert.deepStrictEqual(msgs, [msg1, msg3, msg5]) // msg 2 & 3 will be missing
                expect(gapHandler).toHaveBeenCalledTimes(2)
                done()
            }
        }, gapHandler, 100, 100)

        util.on('error', done)

        util.add(msg1)
        // missing msg2
        util.add(msg3)
        // missing msg4
        util.add(msg5)
    })

    it('can force-fill multiple gaps out of order', (done) => {
        const msgs = []
        const gapHandler = jest.fn((from, to) => {
            if (to.timestamp === 2) {
                util.markMessageExplicitly(msg4)
                util.markMessageExplicitly(msg2)
            }
        })

        const skipped = []
        const onSkip = jest.fn((msg) => {
            skipped.push(msg)
        })

        util = new OrderedMsgChain('publisherId', 'msgChainId', (msg) => {
            msgs.push(msg)
            if (msgs[msgs.length - 1].getMessageRef().timestamp === 5) {
                assert.deepStrictEqual(msgs, [msg1, msg3, msg5]) // msg 2 & 3 will be missing
                expect(gapHandler).toHaveBeenCalledTimes(1)
                expect(onSkip).toHaveBeenCalledTimes(2)
                expect(skipped).toEqual([msg2, msg4])
                done()
            }
        }, gapHandler, 100, 100)

        util.on('skip', onSkip)

        util.on('error', done)

        util.add(msg1)
        // missing msg2
        util.add(msg3)
        // missing msg4
        util.add(msg5)
    })

    it('does not hold onto old markMessageExplicitly messages', (done) => {
        const msgs = []
        const gapHandler = jest.fn((from, to) => {
            if (to.timestamp === 2) {
                util.markMessageExplicitly(msg2)
                util.markMessageExplicitly(msg4)
            }
        })

        util = new OrderedMsgChain('publisherId', 'msgChainId', (msg) => {
            msgs.push(msg)
            if (msgs[msgs.length - 1].getMessageRef().timestamp === 5) {
                util.markMessageExplicitly(msg2)
                assert.deepStrictEqual(msgs, [msg1, msg3, msg5]) // msg 2 & 3 will be missing
                assert.deepStrictEqual([
                    util.markedExplicitly.has(msg1),
                    util.markedExplicitly.has(msg2),
                    util.markedExplicitly.has(msg3),
                    util.markedExplicitly.has(msg4),
                    util.markedExplicitly.has(msg5),
                ], [
                    false,
                    false,
                    false,
                    false,
                    false,
                ])
                expect(gapHandler).toHaveBeenCalledTimes(1)
                done()
            }
        }, gapHandler, 100, 100)

        util.on('error', done)

        util.add(msg1)
        // missing msg2
        util.add(msg3)
        // missing msg4
        util.add(msg5)
    })

    it('call the gap handler MAX_GAP_REQUESTS times and then throws', (done) => {
        let counter = 0
        util = new OrderedMsgChain('publisherId', 'msgChainId', () => {}, (from, to, publisherId, msgChainId) => {
            assert.strictEqual(from.timestamp, msg1.getMessageRef().timestamp)
            assert.strictEqual(from.sequenceNumber, msg1.getMessageRef().sequenceNumber + 1)
            assert.deepStrictEqual(to, msg3.prevMsgRef)
            assert.strictEqual(publisherId, 'publisherId')
            assert.strictEqual(msgChainId, 'msgChainId')
            counter += 1
        }, 100, 100)
        util.on('error', (e) => {
            assert.strictEqual(e.message, 'Failed to fill gap between [1,1] and [2,0] for publisherId-msgChainId'
                + ` after ${OrderedMsgChain.MAX_GAP_REQUESTS} trials`)
            assert.strictEqual(counter, OrderedMsgChain.MAX_GAP_REQUESTS)
            done()
        })
        util.add(msg1)
        util.add(msg3)
    })

    it('after MAX_GAP_REQUESTS OrderingUtil gives up on filling gap ', (done) => {
        const received = []
        util = new OrderedMsgChain('publisherId', 'msgChainId', (msg) => {
            received.push(msg)
        }, () => {}, 5, 5)

        util.add(msg1)
        util.add(msg3)
        util.add(msg4)

        util.once('error', (err) => {
            if (err instanceof GapFillFailedError) {
                setImmediate(() => {
                    util.add(msg6)
                    util.once('error', (err2) => {
                        if (err2 instanceof GapFillFailedError) {
                            setImmediate(() => {
                                assert.deepStrictEqual(received, [msg1, msg3, msg4, msg6])
                                done()
                            })
                        }
                    })
                })
            }
        })
    })

    it('handles unordered messages in order (large randomized test)', () => {
        const expected = [msg1]
        let i
        for (i = 2; i <= 1000; i++) {
            expected.push(createMsg(i, 0, i - 1, 0))
        }
        const shuffled = shuffle(expected)
        const received = []
        util = new OrderedMsgChain('publisherId', 'msgChainId', (msg) => {
            received.push(msg)
        }, () => {}, 50)
        util.add(msg1)
        shuffled.forEach((msg) => {
            if (msg.getTimestamp() !== msg1.getTimestamp()) {
                util.add(msg)
            }
        })
        try {
            assert.deepStrictEqual(received, expected)
        } catch (e) {
            const shuffledTimestamps = []
            shuffled.forEach((streamMessage) => {
                shuffledTimestamps.push(streamMessage.getTimestamp())
            })
            const receivedTimestamps = []
            received.forEach((streamMessage) => {
                receivedTimestamps.push(streamMessage.getTimestamp())
            })
            throw new Error('Was expecting to receive messages ordered per timestamp but instead received timestamps in this '
                + `order:\n${receivedTimestamps}.\nThe unordered messages were processed in the following timestamp order:\n${shuffledTimestamps}`)
        }
    })
})

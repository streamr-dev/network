import assert from 'assert'

import shuffle from 'array-shuffle'

import OrderedMsgChain from '../../../src/utils/OrderedMsgChain'
import StreamMessage from '../../../src/protocol/message_layer/StreamMessage'
import GapFillFailedError from '../../../src/errors/GapFillFailedError'
import MessageID from '../../../src/protocol/message_layer/MessageID'
import MessageRef from '../../../src/protocol/message_layer/MessageRef'

/**
 * Split an array into numChunks chunks.
 * Sort of the opposite of flatMap.
 * e.g.
 * splitArrayIntoChunks([1,2,3,4,5,6], 3) => [[1,2],[3,4],[5,6]]
 * splitArrayIntoChunks([1,2,3,4,5], 3) => [[1,2],[3,4],[5]]
 * splitArrayIntoChunks([1,2,3,4,5], 2) => [[1,2,3],[4,5]]
 */
function splitArrayIntoChunks<T>(array: T[], numChunks = 1): T[][] {
    const { length } = array
    const size = Math.max(Math.ceil(length / numChunks), 0)
    if (!length || size < 1) {
        return []
    }

    const result = []
    for (let i = 0; i < length; i += size) {
        result.push(array.slice(i, i + size))
    }
    return result
}

const createMsg = ({
    timestamp = 1,
    sequenceNumber = 0,
    prevTimestamp = null,
    prevSequenceNumber = 0,
    content = {},
    publisherId = 'publisherId',
    msgChainId = 'msgChainId'
}: {
    timestamp?: number;
    sequenceNumber?: number;
    prevTimestamp?: number | null;
    prevSequenceNumber?: number;
    content?: Record<string, unknown>;
    publisherId?: string;
    msgChainId?: string
} = {}) => {
    const prevMsgRef = prevTimestamp ? new MessageRef(prevTimestamp, prevSequenceNumber) : null
    return new StreamMessage({
        messageId: new MessageID('streamId', 0, timestamp, sequenceNumber, publisherId, msgChainId),
        prevMsgRef,
        content,
    })
}

describe('OrderedMsgChain', () => {
    const msg1 = createMsg({ timestamp: 1, sequenceNumber: 0 })
    const msg2 = createMsg({ timestamp: 2, sequenceNumber: 0, prevTimestamp: 1, prevSequenceNumber: 0 })
    const msg3 = createMsg({ timestamp: 3, sequenceNumber: 0, prevTimestamp: 2, prevSequenceNumber: 0 })
    const msg4 = createMsg({ timestamp: 4, sequenceNumber: 0, prevTimestamp: 3, prevSequenceNumber: 0 })
    const msg5 = createMsg({ timestamp: 5, sequenceNumber: 0, prevTimestamp: 4, prevSequenceNumber: 0 })
    const msg6 = createMsg({ timestamp: 6, sequenceNumber: 0, prevTimestamp: 5, prevSequenceNumber: 0 })
    let util: OrderedMsgChain

    afterEach(() => {
        util.clearGap()
    })

    it('handles ordered messages in order', () => {
        const received: StreamMessage[] = []
        const onDrain = jest.fn()
        util = new OrderedMsgChain('publisherId', 'msgChainId', (msg: StreamMessage) => {
            received.push(msg)
        }, () => {
            throw new Error('Unexpected gap')
        })
        util.on('drain', onDrain)
        util.add(msg1)
        util.add(msg2)
        util.add(msg3)
        assert.deepStrictEqual(received, [msg1, msg2, msg3])
        expect(onDrain).toHaveBeenCalledTimes(0) // should not call if queue doesn't grow larger than one
    })

    it('handles unordered messages in order', () => {
        const received: StreamMessage[] = []
        const onDrain = jest.fn()
        util = new OrderedMsgChain('publisherId', 'msgChainId', (msg: StreamMessage) => {
            received.push(msg)
        }, () => {})
        util.on('drain', onDrain)
        util.add(msg1)
        util.add(msg2)
        util.add(msg5)
        util.add(msg3)
        util.add(msg4)
        assert.deepStrictEqual(received, [msg1, msg2, msg3, msg4, msg5])
        expect(onDrain).toHaveBeenCalledTimes(1) // should have queued > 1
    })

    it('handles unchained messages in the order in which they arrive if they are newer', () => {
        const onDrain = jest.fn()
        // NOTE: this behaviour isn't ideal, perhaps debounce in the hope that
        // a better ordering appears?  When unchained messages arrive they just
        // get immediately processed so if you add 3 unchained messages
        // out-of-order in the same tick: [msg1, msg3, msg2] msg2 will always
        // vanish.
        //
        // Unchained messages don't have a prevMsgRef, so it doesn't know to
        // request a gapfill or that if it just waited for a moment it might
        // get a better ordering Perhaps we could add a momentary delay for
        // unchained, or even initial messages, in the hopes that more ordered
        // messages will arrive shortly
        const m2 = createMsg({ timestamp: 4, sequenceNumber: 0 })
        const m3 = createMsg({ timestamp: 7, sequenceNumber: 0 })
        const m4 = createMsg({ timestamp: 17, sequenceNumber: 0 })
        const received: StreamMessage[] = []
        util = new OrderedMsgChain('publisherId', 'msgChainId', (msg: StreamMessage) => {
            received.push(msg)
        }, () => {})
        util.on('drain', onDrain)
        util.add(msg1)
        util.add(m2)
        util.add(m4)
        util.add(m3) // thhis should be dropped because m4 was newer
        assert.deepStrictEqual(received, [msg1, m2, m4])
        expect(onDrain).toHaveBeenCalledTimes(0) // nothing should have queued
    })

    it('handles unchained messages arriving that fill a gap', (done) => {
        const unchainedMsg2 = createMsg({ timestamp: 2, sequenceNumber: 0 })
        const received: StreamMessage[] = []
        util = new OrderedMsgChain('publisherId', 'msgChainId', (msg: StreamMessage) => {
            received.push(msg)
        }, () => {
            util.add(unchainedMsg2)
        }, 10, 10)

        util.once('drain', () => {
            expect(received).toEqual([msg1, unchainedMsg2, msg3])
            done()
        })
        util.add(msg1)
        util.add(msg3)
    })

    it('handles out-of-order unchained messages arriving that partially fill a gap', (done) => {
        // ensures unchained messages don't break anything during gapfill
        // take a chain with multiple gaps, and fill them in reverse order using unchained messages.
        const unchainedMsg2 = createMsg({ timestamp: 2, sequenceNumber: 0 })
        const unchainedMsg4 = createMsg({ timestamp: 4, sequenceNumber: 0 })
        const received: StreamMessage[] = []
        let count = 0
        util = new OrderedMsgChain('publisherId', 'msgChainId', (msg: StreamMessage) => {
            received.push(msg)
        }, () => {
            count += 1
            switch (count) {
                case 1: {
                    // 2. fill second gap first,
                    // should retry gapfill on first gap
                    util.add(unchainedMsg4)
                    util.add(unchainedMsg4) // bonus: also check it drops duplicate unchained
                    break
                }
                case 2:  {
                    // 3. on retry, filling first gap completes sequence
                    util.add(unchainedMsg2)
                    break
                }
                default: {
                    // noop
                }
            }
        }, 10, 10)

        util.once('drain', () => {
            expect(received).toEqual([msg1, unchainedMsg2, msg3, unchainedMsg4, msg5])
            done()
        })

        // 1. add chain with multiple gaps
        util.add(msg1)
        util.add(msg3)
        util.add(msg5)
    })

    it('drops duplicates', () => {
        const received: StreamMessage[] = []
        util = new OrderedMsgChain('publisherId', 'msgChainId', (msg: StreamMessage) => {
            received.push(msg)
        }, () => {
            throw new Error('Unexpected gap')
        })
        util.add(msg1)
        util.add(msg1)
        util.add(msg2)
        util.add(msg1)
        util.add(msg2)
        assert.deepStrictEqual(received, [msg1, msg2])
    })

    it('drops duplicates after gap', (done) => {
        const onDrain = jest.fn()
        const received: StreamMessage[] = []
        util = new OrderedMsgChain('publisherId', 'msgChainId', (msg: StreamMessage) => {
            received.push(msg)
        }, () => {
            util.add(msg3) // fill gap
            setTimeout(() => {
                assert.deepStrictEqual(received, [msg1, msg2, msg3, msg4])
                expect(onDrain).toHaveBeenCalledTimes(1) // nothing should have queued
                done()
            }, 0)
        }, 50)
        util.on('drain', onDrain)
        util.add(msg1)
        util.add(msg2)
        // duplicate messages after gap
        util.add(msg4)
        util.add(msg4)
    })

    it('calls the gap handler', (done) => {
        const received: StreamMessage[] = []
        util = new OrderedMsgChain('publisherId', 'msgChainId', (msg: StreamMessage) => {
            received.push(msg)
        }, (from: MessageRef, to: MessageRef, publisherId: string, msgChainId: string) => {
            assert.deepStrictEqual(received, [msg1, msg2])
            assert.strictEqual(from.timestamp, msg2.getMessageRef().timestamp)
            assert.strictEqual(from.sequenceNumber, msg2.getMessageRef().sequenceNumber + 1)
            assert.deepStrictEqual(to, msg5.prevMsgRef)
            assert.strictEqual(publisherId, 'publisherId')
            assert.strictEqual(msgChainId, 'msgChainId')
            util.clearGap()
            done()
        }, 50)
        util.add(msg1)
        util.add(msg2)
        util.add(msg5)
    })

    it('does not call the gap handler (scheduled but resolved before timeout)', () => {
        const received: StreamMessage[] = []
        util = new OrderedMsgChain('publisherId', 'msgChainId', (msg: StreamMessage) => {
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
        const msgs: StreamMessage[] = []
        util = new OrderedMsgChain('publisherId', 'msgChainId', (msg: StreamMessage) => {
            msgs.push(msg)
            if (msgs.length === 5) {
                assert.deepStrictEqual(msgs, [msg1, msg2, msg3, msg4, msg5])
                done()
            }
        }, (_from: MessageRef, to: MessageRef) => {
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

    describe('markMessageExplicitly', () => {
        it('can force-fill multiple gaps', (done) => {
            const msgs: StreamMessage[] = []
            const gapHandler = jest.fn((_from, to) => {
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

            util = new OrderedMsgChain('publisherId', 'msgChainId', (msg: StreamMessage) => {
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
            const msgs: StreamMessage[] = []
            const gapHandler = jest.fn((_from, to) => {
                if (to.timestamp === 2) {
                    util.markMessageExplicitly(msg4)
                    util.markMessageExplicitly(msg2)
                }
            })

            const skipped: StreamMessage[] = []
            const onSkip = jest.fn((msg) => {
                skipped.push(msg)
            })

            util = new OrderedMsgChain('publisherId', 'msgChainId', (msg: StreamMessage) => {
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
            const msgs: StreamMessage[] = []
            const gapHandler = jest.fn((_from, to) => {
                if (to.timestamp === 2) {
                    util.markMessageExplicitly(msg2)
                    util.markMessageExplicitly(msg4)
                }
            })

            util = new OrderedMsgChain('publisherId', 'msgChainId', (msg: StreamMessage) => {
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

        it('still requests gapfill for gaps after msg marked explicitly', (done) => {
            // Previously, marking a message anywhere inside a gap would skip
            // straight to the next message in the queue, rather than trying to
            // fill any gap between the marked message and the next queued
            // message.
            const msgs: StreamMessage[] = []
            let count = 0
            const gapHandler = jest.fn(() => {
                count += 1
                if (count === 1) {
                    util.markMessageExplicitly(msg3)
                }
            })

            const onGapFailure = jest.fn()
            const onSkip = jest.fn()

            util = new OrderedMsgChain('publisherId', 'msgChainId', (msg: StreamMessage) => {
                msgs.push(msg)
                if (msgs.length !== 2) { return }
                setTimeout(() => {
                    expect(msgs).toEqual([msg1, msg5]) // msg 2, 3 & 4 will be missing
                    // ensure none still marked explicitly
                    expect([
                        util.markedExplicitly.has(msg1),
                        util.markedExplicitly.has(msg2),
                        util.markedExplicitly.has(msg3),
                        util.markedExplicitly.has(msg4),
                        util.markedExplicitly.has(msg5),
                    ]).toEqual([ false, false, false, false, false ])
                    expect(util.size()).toBe(0)
                    expect(util.isEmpty()).toEqual(true)
                    expect(gapHandler).toHaveBeenCalled()
                    expect(onGapFailure).toHaveBeenCalledTimes(2)
                    expect(onSkip).toHaveBeenCalledTimes(1)
                    expect(onSkip).toHaveBeenCalledWith(msg3)
                    done()
                }, 0)
            }, gapHandler, 10, 10, 3)

            util.on('skip', onSkip)
            util.on('error', (err) => {
                if (!(err instanceof GapFillFailedError)) { throw err }
                onGapFailure()
            })

            util.add(msg1)
            // missing msg2 (gap fail on this)
            // missing msg3 (mark in gap handler, should appear skipped)
            // missing msg4 (gap fail again on this i.e. don't immediately fast-forward to msg5)
            util.add(msg5)
        })
    })

    describe('maxGapRequests', () => {
        it('call the gap handler maxGapRequests times and then fails with GapFillFailedError', (done) => {
            let counter = 0
            util = new OrderedMsgChain('publisherId', 'msgChainId', () => {}, (from: MessageRef, to: MessageRef, publisherId: string, msgChainId: string) => {
                assert.strictEqual(from.timestamp, msg1.getMessageRef().timestamp)
                assert.strictEqual(from.sequenceNumber, msg1.getMessageRef().sequenceNumber + 1)
                assert.deepStrictEqual(to, msg3.prevMsgRef)
                assert.strictEqual(publisherId, 'publisherId')
                assert.strictEqual(msgChainId, 'msgChainId')
                counter += 1
            }, 100, 100)
            util.once('error', (err: Error) => {
                expect(err).toBeInstanceOf(GapFillFailedError)
                if (err instanceof GapFillFailedError) {
                    expect(err.from.serialize()).toEqual('[1,1]')
                    expect(err.to.serialize()).toEqual('[2,0]')
                    expect(err.publisherId).toBe('publisherId')
                    expect(err.msgChainId).toBe('msgChainId')
                    expect(counter).toBe(util.maxGapRequests)
                }
                done()
            })
            util.add(msg1)
            util.add(msg3)
        })

        it('after maxGapRequests OrderingUtil gives up on filling gap with GapFillFailedError "error" event', (done) => {
            const received: StreamMessage[] = []
            util = new OrderedMsgChain('publisherId', 'msgChainId', (msg: StreamMessage) => {
                received.push(msg)
            }, () => {}, 5, 5)

            util.add(msg1)
            util.add(msg3)
            util.add(msg4)
            const onGap = jest.fn()
            util.on('error', (err: Error) => {
                if (!(err instanceof GapFillFailedError)) { throw err }
                onGap()
            })

            util.once('error', (err: Error) => {
                if (!(err instanceof GapFillFailedError)) { throw err }
                setImmediate(() => {
                    util.once('error', (err2: Error) => {
                        if (!(err2 instanceof GapFillFailedError)) { throw err2 }
                        setImmediate(() => {
                            util.debugStatus()
                            assert.deepStrictEqual(received, [msg1, msg3, msg4, msg6])
                            expect(util.size()).toEqual(0)
                            expect(util.isEmpty()).toEqual(true)
                            expect(util.hasPendingGap).toEqual(false)
                            expect(onGap).toHaveBeenCalledTimes(2)
                            done()
                        })
                    })
                    util.add(msg6)
                })
            })
        })
    })

    it('handles unordered messages in order (large randomized test)', () => {
        const expected = [msg1]
        for (let i = 2; i <= 1000; i++) {
            expected.push(createMsg({ timestamp: i, sequenceNumber: 0, prevTimestamp: i - 1, prevSequenceNumber: 0 }))
        }
        const shuffled = shuffle(expected)
        const received: StreamMessage[] = []
        util = new OrderedMsgChain('publisherId', 'msgChainId', (msg: StreamMessage) => {
            received.push(msg)
        }, () => {}, 50)
        util.add(msg1)
        shuffled.forEach((msg) => {
            util.add(msg)
        })

        try {
            assert.deepStrictEqual(received, expected)
        } catch (e) {
            const timestamps: number[] = []
            expected.forEach((streamMessage: StreamMessage) => {
                timestamps.push(streamMessage.getTimestamp())
            })
            const receivedTimestamps: number[] = []
            received.forEach((streamMessage: StreamMessage) => {
                receivedTimestamps.push(streamMessage.getTimestamp())
            })
            throw new Error('Was expecting to receive messages ordered per timestamp but instead received timestamps in this '
                + `order:\n${receivedTimestamps}.\nThe unordered messages were processed in the following timestamp order:\n${timestamps}`)
        }
    })

    it('handles unordered messages in order with gapfill (large randomized test)', (done) => {
        // this test breaks a large number of messages in random order, with duplicates, into chunks
        // each time queue is drained or gap is detected, it adds the next chunk of messages.
        const expected = [msg1]
        const NUM_CHUNKS = 12
        for (let i = 2; i <= 1000; i++) {
            expected.push(createMsg({
                timestamp: i,
                sequenceNumber: 0,
                prevTimestamp: i - 1,
                prevSequenceNumber: 0
            }))
        }
        // some number of the original messages get duplicated at random
        const DUPLICATE_FACTOR = 1 / 3
        const duplicates = shuffle(expected).slice(0, expected.length * DUPLICATE_FACTOR)
        // mix duplicates with original and shuffle it all up
        const shuffled = shuffle([...duplicates, ...expected])
        // split into chunks
        const chunks = splitArrayIntoChunks(shuffled, NUM_CHUNKS)

        let debugTimer: ReturnType<typeof setTimeout>

        // get next chunk or verify we're done
        function next() {
            const result = nextChunk()
            util.debugStatus()
            if (result) {
                return
            }
            setTimeout(() => {
                checkDone()
            }, 0)
        }

        function nextChunk() {
            const items = chunks.pop()
            if (!items) { return false }
            items.forEach((msg) => {
                util.add(msg)
            })
            return true
        }

        function checkDone() {
            clearTimeout(debugTimer)
            try {
                expect(received).toEqual(expected)
            } catch (e) {
                const timestamps: number[] = []
                expected.forEach((streamMessage: StreamMessage) => {
                    timestamps.push(streamMessage.getTimestamp())
                })
                const receivedTimestamps: number[] = []
                received.forEach((streamMessage: StreamMessage) => {
                    receivedTimestamps.push(streamMessage.getTimestamp())
                })

                expect(received)
                done(new Error('Was expecting to receive messages ordered per timestamp but instead received timestamps in this '
                                + `order:\n${receivedTimestamps}.\nThe unordered messages were processed in the following timestamp order:\n${timestamps}`))
                return
            }
            done()
        }

        const received: StreamMessage[] = []

        util = new OrderedMsgChain('publisherId', 'msgChainId', (msg: StreamMessage) => {
            received.push(msg)
            clearTimeout(debugTimer)
            // log current status if waiting
            debugTimer = setTimeout(() => {
                util.debugStatus()
            }, 100)
        }, () => {
            next()
        }, 10, 10, NUM_CHUNKS * 2)

        util.on('drain', () => {
            next()
        })

        // important: add first message first
        util.add(msg1)

        next()
    }, 10000)
})

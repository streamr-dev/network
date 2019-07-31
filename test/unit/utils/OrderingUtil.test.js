import assert from 'assert'

import OrderingUtil from '../../../src/utils/OrderingUtil'
import StreamMessage from '../../../src/protocol/message_layer/StreamMessage'
import StreamMessageV31 from '../../../src/protocol/message_layer/StreamMessageV31'

const createMsg = (
    timestamp = 1, sequenceNumber = 0, prevTimestamp = null,
    prevSequenceNumber = 0, content = {}, publisherId = 'publisherId', msgChainId = '1',
) => {
    const prevMsgRef = prevTimestamp ? [prevTimestamp, prevSequenceNumber] : null
    return new StreamMessageV31(
        ['streamId', 0, timestamp, sequenceNumber, publisherId, msgChainId], prevMsgRef,
        StreamMessage.CONTENT_TYPES.MESSAGE, StreamMessage.ENCRYPTION_TYPES.NONE, content, StreamMessage.SIGNATURE_TYPES.NONE,
    )
}

const msg = createMsg()

describe('OrderingUtil', () => {
    let util
    afterEach(() => {
        util.clearGaps()
    })
    it('calls the message handler when a message is received', (done) => {
        const handler = (streamMessage) => {
            assert.deepStrictEqual(streamMessage.serialize(), msg.serialize())
            done()
        }
        util = new OrderingUtil('streamId', 0, handler, () => {})
        util.add(msg)
    })
    it('calls the gap handler if a gap is detected', (done) => {
        const gapHandler = (from, to, publisherId) => {
            assert.equal(from.timestamp, 1)
            assert.equal(from.sequenceNumber, 1)
            assert.equal(to.timestamp, 3)
            assert.equal(to.sequenceNumber, 0)
            assert.equal(publisherId, 'publisherId')
            done()
        }
        util = new OrderingUtil('streamId', 0, () => {}, gapHandler, 50, 50)
        const msg1 = msg
        const msg4 = createMsg(4, undefined, 3)
        util.add(msg1)
        util.add(msg4)
    })
    it('does not call gap handler if gap detected but resolved before request should be sent', (done) => {
        const gapHandler = () => {
            throw new Error('The gap handler should not be called.')
        }
        util = new OrderingUtil('streamId', 0, () => {}, gapHandler, 5000, 5000)
        const msg1 = msg
        const msg2 = createMsg(2, undefined, 1)
        const msg3 = createMsg(3, undefined, 2)
        const msg4 = createMsg(4, undefined, 3)
        util.add(msg1)
        util.add(msg4)
        setTimeout(() => {
            util.add(msg2)
            util.add(msg3)
            done()
        }, 500)
    })
})

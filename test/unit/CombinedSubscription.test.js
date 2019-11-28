import assert from 'assert'

import sinon from 'sinon'
import { ControlLayer, MessageLayer } from 'streamr-client-protocol'

import CombinedSubscription from '../../src/CombinedSubscription'

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

const msg1 = createMsg()

describe('CombinedSubscription', () => {
    it('handles real time gap that occurred during initial resend', (done) => {
        const msg4 = createMsg(4, undefined, 3)
        const sub = new CombinedSubscription(msg1.getStreamId(), msg1.getStreamPartition(), sinon.stub(), {
            last: 1
        }, {}, 100, 100)
        sub.addPendingResendRequestId('requestId')
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
        sub.handleResending(ControlLayer.ResendResponseResending.create('streamId', 0, 'requestId'))
        sub.handleResentMessage(msg1, sinon.stub().resolves(true))
        sub.handleBroadcastMessage(msg4, sinon.stub().resolves(true))
        sub.handleResent(ControlLayer.ResendResponseNoResend.create('streamId', 0, 'requestId'))
    })
})

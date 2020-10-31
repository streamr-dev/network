import sinon from 'sinon'
import { ControlLayer, MessageLayer } from 'streamr-client-protocol'

import CombinedSubscription from '../../src/CombinedSubscription'

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

const msg1 = createMsg()

describe('CombinedSubscription', () => {
    it('handles real time gap that occurred during initial resend', (done) => {
        const msg4 = createMsg(4, undefined, 3)
        const sub = new CombinedSubscription({
            streamId: msg1.getStreamId(),
            streamPartition: msg1.getStreamPartition(),
            callback: sinon.stub(),
            options: {
                last: 1
            },
            propagationTimeout: 100,
            resendTimeout: 100,
        })
        sub.on('error', done)
        sub.addPendingResendRequestId('requestId')
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
        sub.handleResending(new ControlLayer.ResendResponseResending({
            streamId: 'streamId',
            streamPartition: 0,
            requestId: 'requestId',
        }))
        sub.handleResentMessage(msg1, 'requestId', sinon.stub().resolves(true))
        sub.handleBroadcastMessage(msg4, sinon.stub().resolves(true))
        sub.handleResent(new ControlLayer.ResendResponseNoResend({
            streamId: 'streamId',
            streamPartition: 0,
            requestId: 'requestId',
        }))
    })
})

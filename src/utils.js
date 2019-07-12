const { StreamMessage } = require('streamr-client-protocol').MessageLayer

/**
 *
 * Convert a message received from the network API into a StreamrMessage
 */
const networkMessageToStreamrMessage = (msg) => StreamMessage.create(
    [
        msg.streamId,
        msg.streamPartition,
        msg.timestamp,
        msg.sequenceNo,
        msg.publisherId,
        msg.msgChainId
    ],
    msg.previousTimestamp == null ? null : [msg.previousTimestamp, msg.previousSequenceNo],
    StreamMessage.CONTENT_TYPES.MESSAGE,
    StreamMessage.ENCRYPTION_TYPES.NONE,
    msg.data,
    msg.signatureType,
    msg.signature
)

module.exports = {
    networkMessageToStreamrMessage
}

const MessageNotSignedError = require('./errors/MessageNotSignedError')
const VolumeLogger = require('./VolumeLogger')

module.exports = class Publisher {
    constructor(networkNode, partitioner, volumeLogger = new VolumeLogger(0)) {
        this.networkNode = networkNode
        this.partitioner = partitioner
        this.volumeLogger = volumeLogger
    }

    getStreamPartition(stream, partitionKey) {
        return this.partitioner.partition(stream.partitions, partitionKey)
    }

    async publish(stream, streamMessage) {
        if (stream.requireSignedData && !streamMessage.signature) {
            throw new MessageNotSignedError('This stream requires published data to be signed.')
        }

        this.volumeLogger.logInput(streamMessage.getContent().length)

        return this.networkNode.publish(
            streamMessage.getStreamId(),
            streamMessage.getStreamPartition(),
            streamMessage.getTimestamp(),
            streamMessage.messageId.sequenceNumber,
            streamMessage.getPublisherId() || '',
            streamMessage.messageId.msgChainId || '',
            streamMessage.prevMsgRef == null ? null : streamMessage.prevMsgRef.timestamp,
            streamMessage.prevMsgRef == null ? null : streamMessage.prevMsgRef.sequenceNumber,
            streamMessage.parsedContent,
        )
    }
}

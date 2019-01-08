const StreamrBinaryMessage = require('./protocol/StreamrBinaryMessage')
const StreamrBinaryMessageWithKafkaMetadata = require('./protocol/StreamrBinaryMessageWithKafkaMetadata')
const InvalidMessageContentError = require('./errors/InvalidMessageContentError')
const VolumeLogger = require('./utils/VolumeLogger')

module.exports = class Publisher {
    constructor(networkNode, partitioner, volumeLogger = new VolumeLogger(0)) {
        this.networkNode = networkNode
        this.partitioner = partitioner
        this.volumeLogger = volumeLogger
        this.previousTimestamps = {}
    }

    async publish(stream, timestamp, content, partitionKey) {
        if (!content) {
            throw new InvalidMessageContentError(`Empty message content rejected for stream ${stream.id}`)
        }

        const streamId = stream.id
        const streamPartition = this.partitioner.partition(stream.partitions, partitionKey)
        const ts = timestamp || Date.now()
        const sequenceNo = 0
        const publisherId = 'publisherId'
        const previousTimestamp = this.previousTimestamps[streamId] || -1
        const previousSequenceNo = 0
        this.previousTimestamps[streamId] = ts

        const ttl = undefined
        const offset = null
        const previousOffset = null

        const streamrBinaryMessage = new StreamrBinaryMessageWithKafkaMetadata(new StreamrBinaryMessage(
            streamId,
            streamPartition,
            ts,
            ttl || 0,
            StreamrBinaryMessage.CONTENT_TYPE_JSON,
            content,
        ), offset, previousOffset, 0)

        this.volumeLogger.logInput(streamrBinaryMessage.getStreamrBinaryMessage().getContentBuffer().length)

        return this.networkNode.publish(
            streamId,
            streamPartition,
            ts,
            sequenceNo,
            publisherId,
            previousTimestamp,
            previousSequenceNo,
            streamrBinaryMessage.toArray(),
        )
    }
}

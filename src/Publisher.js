const StreamrBinaryMessage = require('./protocol/StreamrBinaryMessage')
const StreamrBinaryMessageWithKafkaMetadata = require('./protocol/StreamrBinaryMessageWithKafkaMetadata')
const InvalidMessageContentError = require('./errors/InvalidMessageContentError')
const VolumeLogger = require('./utils/VolumeLogger')

module.exports = class Publisher {
    constructor(networkNode, partitioner, volumeLogger = new VolumeLogger(0)) {
        this.networkNode = networkNode
        this.partitioner = partitioner
        this.volumeLogger = volumeLogger
    }

    async publish(stream, timestamp, content, partitionKey) {
        if (!content) {
            throw new InvalidMessageContentError(`Empty message content rejected for stream ${stream.id}`)
        }

        const streamPartition = this.partitioner.partition(stream.partitions, partitionKey)

        const ttl = undefined
        const offset = null
        const previousOffset = null

        const streamrBinaryMessage = new StreamrBinaryMessageWithKafkaMetadata(new StreamrBinaryMessage(
            stream.id,
            streamPartition,
            timestamp || Date.now(),
            ttl || 0,
            StreamrBinaryMessage.CONTENT_TYPE_JSON,
            content,
        ), offset, previousOffset, 0)

        this.volumeLogger.logInput(streamrBinaryMessage.getStreamrBinaryMessage().getContentBuffer().length)

        return this.networkNode.publish(stream.id, streamPartition, streamrBinaryMessage.toArray())
    }
}

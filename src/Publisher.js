const StreamrBinaryMessage = require('./protocol/StreamrBinaryMessage')
const StreamrBinaryMessageWithKafkaMetadata = require('./protocol/StreamrBinaryMessageWithKafkaMetadata')
const InvalidMessageContentError = require('./errors/InvalidMessageContentError')
const VolumeLogger = require('./utils/VolumeLogger')

module.exports = class Publisher {
    constructor(networkNode, partitioner, volumeLogger = new VolumeLogger(0)) {
        this.networkNode = networkNode
        this.partitioner = partitioner
        this.volumeLogger = volumeLogger
        this.offsetByStream = {}
    }

    async publish(stream, timestamp, content, partitionKey) {
        if (!content) {
            throw new InvalidMessageContentError(`Empty message content rejected for stream ${stream.id}`)
        }

        const streamPartition = this.partitioner.partition(stream.partitions, partitionKey)

        // TODO: remove offset stamping when done elsewhere
        const previousOffset = this.offsetByStream[stream]
        if (previousOffset === undefined) {
            this.offsetByStream[stream] = 0
        }
        this.offsetByStream[stream] += 1

        const ttl = undefined
        const offset = this.offsetByStream[stream]
        const contentType = 27

        const streamrBinaryMessage = new StreamrBinaryMessageWithKafkaMetadata(new StreamrBinaryMessage(
            stream.id,
            streamPartition,
            timestamp || Date.now(),
            ttl || 0,
            contentType,
            content,
        ), offset, previousOffset, 0)

        //this.volumeLogger.logInput(streamrBinaryMessage.getStreamrBinaryMessage().getContentBuffer().length)

        return this.networkNode.publish(stream.id, streamPartition, streamrBinaryMessage.toArray())
    }
}

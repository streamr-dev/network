const InvalidMessageContentError = require('./errors/InvalidMessageContentError')

module.exports = class Publisher {
    constructor(networkNode, partitioner) {
        this.networkNode = networkNode
        this.partitioner = partitioner
    }

    async publish(stream, timestamp, content, partitionKey) {
        if (!content) {
            throw new InvalidMessageContentError(`Empty message content rejected for stream ${stream.id}`)
        }

        const streamPartition = this.partitioner.partition(stream.partitions, partitionKey)

        return this.networkNode.publish(stream.id, streamPartition, content)
    }
}

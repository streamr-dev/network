const InvalidMessageContentError = require('./errors/InvalidMessageContentError')

module.exports = class Publisher {
    constructor(networkNode, partitioner) {
        this.networkNode = networkNode
        this.partitioner = partitioner
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

        const version = '28'
        const ttl = undefined
        const offset = this.offsetByStream[stream]
        const contentType = 27

        const protocolMessage = [
            version,
            stream.id,
            streamPartition,
            timestamp || Date.now(),
            ttl || 0,
            offset,
            previousOffset,
            contentType,
            content,
        ]

        return this.networkNode.publish(stream.id, streamPartition, protocolMessage)
    }
}

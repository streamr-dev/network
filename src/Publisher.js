const debug = require('debug')('Publisher')
const StreamrBinaryMessage = require('./protocol/StreamrBinaryMessage')
const InvalidMessageContentError = require('./errors/InvalidMessageContentError')
const NotReadyError = require('./errors/NotReadyError')

module.exports = class Publisher {
    constructor(kafka, partitioner) {
        this.kafka = kafka
        this.partitioner = partitioner

        kafka.on('ready', () => {
            this.kafkaReady = true
            debug('Kafka is ready')
        })
    }

    async publish(stream, timestamp = Date.now(), ttl = 0, contentType, content, partitionKey) {
        if (!content) {
            throw new InvalidMessageContentError(`Empty message content rejected for stream ${stream.id}`)
        }

        // req.stream is written by authentication middleware
        const streamPartition = this.partitioner.partition(stream.partitions, partitionKey)

        if (!this.kafkaReady) {
            throw new NotReadyError('Server not ready. Please try again shortly.')
        }

        return this.kafka.send(new StreamrBinaryMessage(
            stream.id,
            streamPartition,
            timestamp || Date.now(),
            ttl || 0,
            contentType,
            content,
        ))
    }
}

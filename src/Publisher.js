const debug = require('debug')('Publisher')
const StreamrBinaryMessage = require('./protocol/StreamrBinaryMessage')
const InvalidMessageContentError = require('./errors/InvalidMessageContentError')
const NotReadyError = require('./errors/NotReadyError')
const VolumeLogger = require('./utils/VolumeLogger')

module.exports = class Publisher {
    constructor(kafka, partitioner, volumeLogger = new VolumeLogger(0)) {
        this.kafka = kafka
        this.partitioner = partitioner
        this.volumeLogger = volumeLogger

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

        const streamrBinaryMessage = new StreamrBinaryMessage(
            stream.id,
            streamPartition,
            timestamp || Date.now(),
            ttl || 0,
            contentType,
            content,
        )

        this.volumeLogger.logInput(streamrBinaryMessage.getContentBuffer().length)

        return this.kafka.send(streamrBinaryMessage)
    }
}

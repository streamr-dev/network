const debug = require('debug')('Publisher')
const MessageNotSignedError = require('./errors/MessageNotSignedError')
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

    getStreamPartition(stream, partitionKey) {
        return this.partitioner.partition(stream.partitions, partitionKey)
    }

    async publish(stream, streamMessage) {
        if (stream.requireSignedData && !streamMessage.signature) {
            throw new MessageNotSignedError('This stream requires published data to be signed.')
        }
        if (!streamMessage.getContent()) {
            throw new InvalidMessageContentError(`Empty message content rejected for stream ${stream.id}`)
        }

        if (!this.kafkaReady) {
            throw new NotReadyError('Server not ready. Please try again shortly.')
        }

        this.volumeLogger.logInput(streamMessage.getContent().length)

        return this.kafka.send(streamMessage)
    }
}

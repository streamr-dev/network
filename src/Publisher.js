const debug = require('debug')('Publisher')
const StreamrBinaryMessageV29 = require('./protocol/StreamrBinaryMessageV29')
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

    async publish(stream, timestamp = Date.now(), ttl = 0, contentType, content, partitionKey, signatureType, address, signature) {
        if (stream.requireSignedData && !signature) {
            throw new MessageNotSignedError('This stream requires published data to be signed.')
        }
        if (!content) {
            throw new InvalidMessageContentError(`Empty message content rejected for stream ${stream.id}`)
        }

        // req.stream is written by authentication middleware
        const streamPartition = this.partitioner.partition(stream.partitions, partitionKey)

        if (!this.kafkaReady) {
            throw new NotReadyError('Server not ready. Please try again shortly.')
        }

        const streamrBinaryMessage = new StreamrBinaryMessageV29(
            stream.id,
            streamPartition,
            timestamp || Date.now(),
            ttl || 0,
            contentType,
            content,
            signatureType || StreamrBinaryMessageV29.SIGNATURE_TYPE_NONE,
            address,
            signature,
        )

        this.volumeLogger.logInput(streamrBinaryMessage.getContentBuffer().length)

        return this.kafka.send(streamrBinaryMessage)
    }
}

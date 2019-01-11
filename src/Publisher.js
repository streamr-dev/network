const debug = require('debug')('Publisher')
const StreamrBinaryMessageV29 = require('./protocol/StreamrBinaryMessageV29')
const StreamrBinaryMessageV30 = require('./protocol/StreamrBinaryMessageV30')
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

    async publish(
        stream, streamPartition, timestamp = Date.now(), sequenceNumber, publisherId, prevTimestamp,
        prevSequenceNumber, ttl = 0, contentType, content, signatureType, signature,
    ) {
        if (stream.requireSignedData && !signature) {
            throw new MessageNotSignedError('This stream requires published data to be signed.')
        }
        if (!content) {
            throw new InvalidMessageContentError(`Empty message content rejected for stream ${stream.id}`)
        }

        if (!this.kafkaReady) {
            throw new NotReadyError('Server not ready. Please try again shortly.')
        }

        const streamrBinaryMessage = new StreamrBinaryMessageV30(
            stream.id,
            streamPartition,
            timestamp || Date.now(),
            sequenceNumber,
            publisherId,
            prevTimestamp,
            prevSequenceNumber,
            ttl || 0,
            contentType,
            content,
            signatureType || StreamrBinaryMessageV29.SIGNATURE_TYPE_NONE,
            signature,
        )

        this.volumeLogger.logInput(streamrBinaryMessage.getContentBuffer().length)

        return this.kafka.send(streamrBinaryMessage)
    }
}

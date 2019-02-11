const debug = require('debug')('Publisher')
const StreamrBinaryMessageV29 = require('./protocol/StreamrBinaryMessageV29')
const MessageNotSignedError = require('./errors/MessageNotSignedError')
const InvalidMessageContentError = require('./errors/InvalidMessageContentError')
const NotReadyError = require('./errors/NotReadyError')
const VolumeLogger = require('./utils/VolumeLogger')

module.exports = class Publisher {
    constructor(networkNode, partitioner, volumeLogger = new VolumeLogger(0)) {
        this.networkNode = networkNode
        this.partitioner = partitioner
        this.volumeLogger = volumeLogger
        this.previousTimestamps = {}
    }

    async publish(stream, timestamp, content, partitionKey, signatureType, address, signature) {
        if (stream.requireSignedData && !signature) {
            throw new MessageNotSignedError('This stream requires published data to be signed.')
        }
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

        const streamrBinaryMessage = new StreamrBinaryMessageV29(
            streamId,
            streamPartition,
            ts,
            ttl || 0,
            27, // JSON content type
            content,
            signatureType || StreamrBinaryMessageV29.SIGNATURE_TYPE_NONE,
            address,
            signature,
        )

        this.volumeLogger.logInput(streamrBinaryMessage.getContentBuffer().length)

        return this.networkNode.publish(
            streamId,
            streamPartition,
            ts,
            sequenceNo,
            publisherId,
            previousTimestamp,
            previousSequenceNo,
            streamrBinaryMessage.toObject(false),
        )
    }
}

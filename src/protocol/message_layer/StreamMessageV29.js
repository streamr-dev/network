import UnsupportedVersionError from '../../errors/UnsupportedVersionError'
import StreamMessage from './StreamMessage'
import StreamMessageV28 from './StreamMessageV28'
import StreamMessageV30 from './StreamMessageV30'

const VERSION = 29

export default class StreamMessageV29 extends StreamMessage {
    constructor(streamId, streamPartition, timestamp, ttl, offset, previousOffset, contentType, content, signatureType, publisherAddress, signature) {
        super(VERSION, streamId, contentType, content)
        this.ttl = ttl
        this.streamPartition = streamPartition
        this.timestamp = timestamp
        this.offset = offset
        this.previousOffset = previousOffset
        this.signatureType = signatureType
        this.publisherAddress = publisherAddress
        this.signature = signature
    }

    getStreamPartition() {
        return this.streamPartition
    }

    getTimestamp() {
        return this.timestamp
    }

    getPublisherId() {
        return this.publisherAddress
    }

    toObject(parsedContent = false, compact = true) {
        if (compact) {
            return [
                this.version,
                this.streamId,
                this.streamPartition,
                this.timestamp,
                this.ttl,
                this.offset,
                this.previousOffset,
                this.contentType,
                this.getContent(parsedContent),
                this.signatureType,
                this.publisherAddress,
                this.signature,
            ]
        }
        return {
            streamId: this.streamId,
            streamPartition: this.streamPartition,
            timestamp: this.timestamp,
            ttl: this.ttl,
            offset: this.offset,
            previousOffset: this.previousOffset,
            contentType: this.contentType,
            content: this.getContent(parsedContent),
            signatureType: this.signatureType,
            publisherAddress: this.publisherAddress,
            signature: this.signature,
        }
    }

    toOtherVersion(version) {
        if (version === 28) {
            return new StreamMessageV28(
                this.streamId, this.streamPartition, this.timestamp,
                this.ttl, this.offset, this.previousOffset, this.contentType, this.getContent(),
            )
        } else if (version === 30) {
            // null fields in order: prevMsgRef.timestamp, prevMsgRef.sequenceNumber
            return new StreamMessageV30(
                [this.streamId, this.streamPartition, this.timestamp, 0, this.publisherAddress],
                [null, null], this.contentType, this.getContent(), this.signatureType, this.signature,
            )
        }
        throw new UnsupportedVersionError(version, 'Supported versions: [28, 29, 30]')
    }

    serialize(version = VERSION) {
        if (version === VERSION) {
            return JSON.stringify(this.toObject())
        }
        return this.toOtherVersion(version).serialize()
    }
}

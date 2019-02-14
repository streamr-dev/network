import UnsupportedVersionError from '../../errors/UnsupportedVersionError'
import StreamMessage from './StreamMessage'
import StreamMessageV29 from './StreamMessageV29'
import StreamMessageV30 from './StreamMessageV30'

const VERSION = 28

export default class StreamMessageV28 extends StreamMessage {
    constructor(streamId, streamPartition, timestamp, ttl, offset, previousOffset, contentType, content) {
        super(VERSION, streamId, contentType, content)
        this.ttl = ttl
        this.streamPartition = streamPartition
        this.timestamp = timestamp
        this.offset = offset
        this.previousOffset = previousOffset
    }

    getStreamPartition() {
        return this.streamPartition
    }

    getTimestamp() {
        return this.timestamp
    }
    /* eslint-disable class-methods-use-this */
    getPublisherId() {
        return undefined
    }
    /* eslint-enable class-methods-use-this */

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
        }
    }

    toOtherVersion(version) {
        if (version === 29) {
            // null fields in order: publisherAddress, signature
            return new StreamMessageV29(
                this.streamId, this.streamPartition, this.timestamp,
                this.ttl, this.offset, this.previousOffset, this.contentType, this.getContent(), 0, null, null,
            )
        } else if (version === 30) {
            // null fields in order: msgId.publisherId, prevMsgRef.timestamp, prevMsgRef.sequenceNumber, signature
            return new StreamMessageV30(
                [this.streamId, this.streamPartition, this.timestamp, 0, null, ''],
                [null, null], this.contentType, this.getContent(), 0, null,
            )
        }
        throw new UnsupportedVersionError(version, 'Supported versions: [28, 29, 30]')
    }

    serialize(version = VERSION, options = {
        stringify: true,
        parsedContent: false,
        compact: true,
    }) {
        if (version === VERSION) {
            if (options.stringify) {
                return JSON.stringify(this.toObject(options.parsedContent, options.compact))
            }
            return this.toObject(options.parsedContent, options.compact)
        }
        return this.toOtherVersion(version).serialize(version, options)
    }
}

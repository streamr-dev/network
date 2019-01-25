import UnsupportedVersionError from '../../errors/UnsupportedVersionError'
import StreamMessage from './StreamMessage'
import StreamMessageV28 from './StreamMessageV28'
import StreamMessageV29 from './StreamMessageV29'
import MessageID from './MessageID'
import MessageRef from './MessageRef'

const VERSION = 30

export default class StreamMessageV30 extends StreamMessage {
    constructor(messageIdArgsArray, prevMessageRefArgsArray, contentType, content, signatureType, signature) {
        super(VERSION, undefined, contentType, content)
        this.messageId = new MessageID(...messageIdArgsArray)
        this.prevMsgRef = prevMessageRefArgsArray ? new MessageRef(...prevMessageRefArgsArray) : null
        this.signatureType = signatureType
        this.signature = signature
    }

    getStreamId() {
        return this.messageId.streamId
    }

    getStreamPartition() {
        return this.messageId.streamPartition
    }

    getTimestamp() {
        return this.messageId.timestamp
    }

    getPublisherId() {
        return this.messageId.publisherId
    }

    toArray(parsedContent = false) {
        return [
            this.version,
            this.messageId.toArray(),
            this.prevMsgRef ? this.prevMsgRef.toArray() : null,
            this.contentType,
            this.getContent(parsedContent),
            this.signatureType,
            this.signature,
        ]
    }

    toOtherVersion(version) {
        const prevTimestamp = this.prevMsgRef ? this.prevMsgRef.timestamp : null
        if (version === 28) {
            // hack for resend and gap detection: messageId.timestamp --> offset, prevMessageRef.timestamp --> previousOffset
            return new StreamMessageV28(
                this.messageId.streamId, this.messageId.streamPartition, this.messageId.timestamp,
                0, this.messageId.timestamp, prevTimestamp, this.contentType, this.getContent(),
            )
        } else if (version === 29) {
            // hack for resend and gap detection: messageId.timestamp --> offset, prevMessageRef.timestamp --> previousOffset
            return new StreamMessageV29(
                this.messageId.streamId, this.messageId.streamPartition, this.messageId.timestamp,
                0, this.messageId.timestamp, prevTimestamp, this.contentType, this.getContent(),
                this.signatureType, this.messageId.publisherId, this.signature,
            )
        }
        throw new UnsupportedVersionError(version, 'Supported versions: [28, 29, 30]')
    }

    serialize(version = VERSION) {
        if (version === VERSION) {
            return JSON.stringify(this.toArray())
        }
        return this.toOtherVersion(version).serialize()
    }
}

import UnsupportedVersionError from '../../errors/UnsupportedVersionError'
import StreamMessage from './StreamMessage'
import StreamMessageV28 from './StreamMessageV28'
import StreamMessageV29 from './StreamMessageV29'
import StreamMessageV31 from './StreamMessageV31'
import MessageID from './MessageID'
import MessageRef from './MessageRef'

const VERSION = 30

export default class StreamMessageV30 extends StreamMessage {
    constructor(messageIdArgsArray, prevMessageRefArgsArray, contentType, content, signatureType, signature, parseContent = true) {
        super(VERSION, undefined, contentType, StreamMessage.ENCRYPTION_TYPES.NONE, content, parseContent)
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

    getSequenceNumber() {
        return this.messageId.sequenceNumber
    }

    getPublisherId() {
        return this.messageId.publisherId
    }

    getMsgChainId() {
        return this.messageId.msgChainId
    }

    getMessageRef() {
        return new MessageRef(this.getTimestamp(), this.getSequenceNumber())
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
                0, this.messageId.timestamp, prevTimestamp, this.contentType, this.getContent(), this.parseContentOption,
            )
        } else if (version === 29) {
            // hack for resend and gap detection: messageId.timestamp --> offset, prevMessageRef.timestamp --> previousOffset
            return new StreamMessageV29(
                this.messageId.streamId, this.messageId.streamPartition, this.messageId.timestamp,
                0, this.messageId.timestamp, prevTimestamp, this.contentType, this.getContent(),
                this.signatureType, this.messageId.publisherId, this.signature, this.parseContentOption,
            )
        } else if (version === 31) {
            const prevArray = this.prevMsgRef ? this.prevMsgRef.toArray() : null
            // hack for resend and gap detection: messageId.timestamp --> offset, prevMessageRef.timestamp --> previousOffset
            return new StreamMessageV31(
                this.messageId.toArray(), prevArray, this.contentType,
                StreamMessage.ENCRYPTION_TYPES.NONE, this.getSerializedContent(), this.signatureType, this.signature, this.parseContentOption,
            )
        }
        throw new UnsupportedVersionError(version, 'Supported versions: [28, 29, 30, 31]')
    }

    serialize(version = VERSION, options = {
        stringify: true,
        parsedContent: false,
    }) {
        if (version === VERSION) {
            if (options.stringify) {
                return JSON.stringify(this.toArray(options.parsedContent))
            }
            return this.toArray(options.parsedContent)
        }
        return this.toOtherVersion(version).serialize(version, options)
    }
}

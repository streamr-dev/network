import { validateIsInteger, validateIsString } from '../../utils/validations'
import UnsupportedVersionError from '../../errors/UnsupportedVersionError'
import StreamMessage from './StreamMessage'
import MessageID from './MessageID'
import MessageRefStrict from './MessageRefStrict'
import StreamMessageV28 from './StreamMessageV28'
import StreamMessageV29 from './StreamMessageV29'
import StreamMessageV30 from './StreamMessageV30'

const VERSION = 31

export default class StreamMessageV31 extends StreamMessage {
    constructor(messageIdArgsArray, prevMessageRefArgsArray, contentType, encryptionType, content, signatureType, signature, parseContent = true) {
        super(VERSION, undefined, contentType, encryptionType, content, parseContent)

        validateIsInteger('signatureType', signatureType)
        validateIsString('signature', signature, true)

        this.messageId = new MessageID(...messageIdArgsArray)
        this.prevMsgRef = prevMessageRefArgsArray ? new MessageRefStrict(...prevMessageRefArgsArray) : null
        this.encryptionType = encryptionType
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
        return new MessageRefStrict(this.getTimestamp(), this.getSequenceNumber())
    }

    toArray(parsedContent = false) {
        return [
            this.version,
            this.messageId.toArray(),
            this.prevMsgRef ? this.prevMsgRef.toArray() : null,
            this.contentType,
            this.encryptionType,
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
        } else if (version === 30) {
            const prevArray = this.prevMsgRef ? this.prevMsgRef.toArray() : null
            return new StreamMessageV30(
                this.messageId.toArray(), prevArray, this.contentType,
                this.getSerializedContent(), this.signatureType, this.signature, this.parseContentOption,
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

StreamMessage.latestClass = StreamMessageV31

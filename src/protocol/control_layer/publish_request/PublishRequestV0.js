import * as TimestampUtil from '../../../utils/TimestampUtil'
import ValidationError from '../../../errors/ValidationError'
import StreamMessageV30 from '../../message_layer/StreamMessageV30'
import StreamMessage from '../../message_layer/StreamMessage'
import ControlMessage from '../ControlMessage'
import PublishRequest from './PublishRequest'

const TYPE = 'publish'
const VERSION = 0

export default class PublishRequestV0 extends PublishRequest {
    constructor(streamId, apiKey, sessionToken, content, timestamp, partitionKey, publisherAddress, signatureType, signature) {
        super(VERSION, sessionToken)
        this.apiKey = apiKey
        this.streamId = streamId

        if (!content) {
            throw new ValidationError('No content given!')
        }
        this.content = content

        if (timestamp) {
            this.timestamp = TimestampUtil.parse(timestamp)
        }

        this.partitionKey = partitionKey
        this.publisherAddress = publisherAddress
        this.signatureType = signatureType
        this.signature = signature
    }

    getStreamId() {
        return this.streamId
    }

    getStreamMessage(streamPartition) {
        return new StreamMessageV30(
            [this.streamId, streamPartition, this.timestamp || Date.now(), 0, this.publisherAddress || '', ''], null,
            StreamMessage.CONTENT_TYPES.MESSAGE, this.content, this.signatureType || StreamMessage.SIGNATURE_TYPES.NONE, this.signature,
        )
    }

    getSerializedContent() {
        if (typeof this.content === 'string') {
            return this.content
        } else if (typeof this.content === 'object') {
            return JSON.stringify(this.content)
        }
        throw new Error('Stream payloads can only be objects!')
    }

    toObject() {
        return {
            type: TYPE,
            stream: this.streamId,
            authKey: this.apiKey,
            sessionToken: this.sessionToken,
            msg: this.getSerializedContent(),
            ts: this.timestamp,
            pkey: this.partitionKey,
            addr: this.publisherAddress,
            sigtype: this.signatureType,
            sig: this.signature,
        }
    }

    serialize() {
        return JSON.stringify(this.toObject())
    }

    static getConstructorArgs(msg) {
        return [
            msg.stream,
            msg.authKey,
            msg.sessionToken,
            msg.msg,
            msg.ts,
            msg.pkey,
            msg.addr,
            msg.sigtype,
            msg.sig,
        ]
    }
}

ControlMessage.registerClass(VERSION, TYPE, PublishRequestV0)

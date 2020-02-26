import { validateIsString, validateIsNotEmptyString, validateIsNotNegativeInteger } from '../../../utils/validations'
import ControlMessage from '../ControlMessage'
import ValidationError from '../../../errors/ValidationError'
import MessageRef from '../../message_layer/MessageRef'
import ResendRangeRequest from './ResendRangeRequest'

const VERSION = 1

export default class ResendRangeRequestV1 extends ResendRangeRequest {
    constructor(streamId, streamPartition, requestId, fromMsgRefArgsArray, toMsgRefArgsArray, publisherId, msgChainId, sessionToken) {
        super(VERSION)

        validateIsNotEmptyString('streamId', streamId)
        validateIsNotNegativeInteger('streamPartition', streamPartition)
        validateIsNotEmptyString('requestId', requestId)
        validateIsString('publisherId', publisherId, true)
        validateIsString('msgChainId', msgChainId, true)
        validateIsString('sessionToken', sessionToken, true)

        this.streamId = streamId
        this.streamPartition = streamPartition
        this.requestId = requestId
        this.fromMsgRef = new MessageRef(...fromMsgRefArgsArray)
        this.toMsgRef = new MessageRef(...toMsgRefArgsArray)
        if (this.fromMsgRef.timestamp > this.toMsgRef.timestamp) {
            throw new ValidationError(`fromMsgRef.timestamp (${this.fromMsgRef.timestamp})` +
            `must be less than or equal to toMsgRef.timestamp (${this.toMsgRef.timestamp})`)
        }
        this.publisherId = publisherId
        this.msgChainId = msgChainId
        this.sessionToken = sessionToken
    }

    toArray(messageLayerVersion) {
        const array = super.toArray()
        array.push(...[
            this.streamId,
            this.streamPartition,
            this.requestId,
            JSON.parse(this.fromMsgRef.serialize(messageLayerVersion)),
            JSON.parse(this.toMsgRef.serialize(messageLayerVersion)),
            this.publisherId,
            this.msgChainId,
            this.sessionToken,
        ])
        return array
    }

    serialize(messageLayerVersion) {
        return JSON.stringify(this.toArray(messageLayerVersion))
    }
}

ControlMessage.registerClass(VERSION, ResendRangeRequest.TYPE, ResendRangeRequestV1)

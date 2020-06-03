import ControlMessage from '../ControlMessage'
import {
    validateIsNotEmptyString,
    validateIsNotNegativeInteger,
    validateIsString,
    validateIsType
} from '../../../utils/validations'
import MessageRef from '../../message_layer/MessageRef'

export default class ResendFromRequest extends ControlMessage {
    constructor({
        version = ControlMessage.LATEST_VERSION, requestId, streamId, streamPartition, fromMsgRef, publisherId, sessionToken
    }) {
        super(version, ControlMessage.TYPES.ResendFromRequest, requestId)

        validateIsNotEmptyString('streamId', streamId)
        validateIsNotNegativeInteger('streamPartition', streamPartition)
        validateIsString('publisherId', publisherId, true)
        validateIsString('sessionToken', sessionToken, true)
        validateIsType('fromMsgRef', fromMsgRef, 'MessageRef', MessageRef)

        this.streamId = streamId
        this.streamPartition = streamPartition
        this.fromMsgRef = fromMsgRef
        this.publisherId = publisherId
        this.sessionToken = sessionToken

        validateIsNotEmptyString('requestId', requestId) // unnecessary line once V1 is dropped
    }
}

import { validateIsNotEmptyString, validateIsNotNegativeInteger, validateIsString } from '../../../utils/validations'
import ControlMessage from '../ControlMessage'

export default class SubscribeRequest extends ControlMessage {
    constructor(version, requestId, streamId, streamPartition, sessionToken) {
        super(version, ControlMessage.TYPES.SubscribeRequest, requestId)

        validateIsNotEmptyString('streamId', streamId)
        validateIsNotNegativeInteger('streamPartition', streamPartition)
        validateIsString('sessionToken', sessionToken, true)

        this.streamId = streamId
        this.streamPartition = streamPartition
        this.sessionToken = sessionToken
    }

    static create(requestId, streamId, streamPartition, sessionToken) {
        return new SubscribeRequest(ControlMessage.LATEST_VERSION, requestId, streamId, streamPartition, sessionToken)
    }
}

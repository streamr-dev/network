import ControlMessage from '../ControlMessage'
import { validateIsNotEmptyString, validateIsNotNegativeInteger, validateIsString } from '../../../utils/validations'

export default class ResendLastRequest extends ControlMessage {
    constructor(version, requestId, streamId, streamPartition, numberLast, sessionToken) {
        super(version, ControlMessage.TYPES.ResendLastRequest, requestId)

        validateIsNotEmptyString('streamId', streamId)
        validateIsNotNegativeInteger('streamPartition', streamPartition)
        validateIsNotNegativeInteger('numberLast', numberLast)
        validateIsString('sessionToken', sessionToken, true)

        this.streamId = streamId
        this.streamPartition = streamPartition
        this.numberLast = numberLast
        this.sessionToken = sessionToken

        validateIsNotEmptyString('requestId', requestId) // unnecessary line once V1 is dropped
    }

    static create(requestId, streamId, streamPartition, numberLast, sessionToken) {
        return new ResendLastRequest(ControlMessage.LATEST_VERSION, requestId, streamId, streamPartition, numberLast, sessionToken)
    }
}

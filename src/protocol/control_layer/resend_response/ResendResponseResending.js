import ControlMessage from '../ControlMessage'
import { validateIsNotEmptyString, validateIsNotNegativeInteger } from '../../../utils/validations'

export default class ResendResponseResending extends ControlMessage {
    constructor(version, requestId, streamId, streamPartition) {
        super(version, ControlMessage.TYPES.ResendResponseResending, requestId)

        validateIsNotEmptyString('streamId', streamId)
        validateIsNotNegativeInteger('streamPartition', streamPartition)

        this.streamId = streamId
        this.streamPartition = streamPartition

        validateIsNotEmptyString('requestId', requestId) // unnecessary line once V1 is dropped
    }

    static create(requestId, streamId, streamPartition) {
        return new ResendResponseResending(ControlMessage.LATEST_VERSION, requestId, streamId, streamPartition)
    }
}

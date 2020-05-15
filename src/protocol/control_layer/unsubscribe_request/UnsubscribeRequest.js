import { validateIsNotEmptyString, validateIsNotNegativeInteger } from '../../../utils/validations'
import ControlMessage from '../ControlMessage'

export default class UnsubscribeRequest extends ControlMessage {
    constructor(version, requestId, streamId, streamPartition) {
        super(version, ControlMessage.TYPES.UnsubscribeRequest, requestId)

        validateIsNotEmptyString('streamId', streamId)
        validateIsNotNegativeInteger('streamPartition', streamPartition)

        this.streamId = streamId
        this.streamPartition = streamPartition
    }

    static create(requestId, streamId, streamPartition) {
        return new UnsubscribeRequest(ControlMessage.LATEST_VERSION, requestId, streamId, streamPartition)
    }
}

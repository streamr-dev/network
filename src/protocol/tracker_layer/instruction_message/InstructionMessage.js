import {
    validateIsNotEmptyString,
    validateIsNotNegativeInteger,
    validateIsArray
} from '../../../utils/validations'
import TrackerMessage from '../TrackerMessage'

export default class InstructionMessage extends TrackerMessage {
    constructor({
        version = TrackerMessage.LATEST_VERSION, requestId, streamId, streamPartition, nodeAddresses, counter
    }) {
        super(version, TrackerMessage.TYPES.InstructionMessage, requestId)

        validateIsNotEmptyString('streamId', streamId)
        validateIsNotNegativeInteger('streamPartition', streamPartition)
        validateIsArray('nodeAddresses', nodeAddresses)
        validateIsNotNegativeInteger('counter', counter)

        this.streamId = streamId
        this.streamPartition = streamPartition
        this.nodeAddresses = nodeAddresses
        this.counter = counter
    }
}

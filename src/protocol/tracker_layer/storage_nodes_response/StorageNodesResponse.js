import {
    validateIsNotEmptyString,
    validateIsNotNegativeInteger,
    validateIsArray
} from '../../../utils/validations'
import TrackerMessage from '../TrackerMessage'

export default class StorageNodesResponse extends TrackerMessage {
    constructor({
        version = TrackerMessage.LATEST_VERSION, requestId, streamId, streamPartition, nodeAddresses
    }) {
        super(version, TrackerMessage.TYPES.StorageNodesResponse, requestId)

        validateIsNotEmptyString('streamId', streamId)
        validateIsNotNegativeInteger('streamPartition', streamPartition)
        validateIsArray('nodeAddresses', nodeAddresses)

        this.streamId = streamId
        this.streamPartition = streamPartition
        this.nodeAddresses = nodeAddresses
    }
}

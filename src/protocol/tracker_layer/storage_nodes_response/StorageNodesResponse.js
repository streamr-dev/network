import {
    validateIsNotEmptyString,
    validateIsNotNegativeInteger,
    validateIsArray
} from '../../../utils/validations'
import TrackerMessage from '../TrackerMessage'

export default class StorageNodesResponse extends TrackerMessage {
    constructor({
        version = TrackerMessage.LATEST_VERSION, requestId, streamId, streamPartition, nodeIds
    }) {
        super(version, TrackerMessage.TYPES.StorageNodesResponse, requestId)

        validateIsNotEmptyString('streamId', streamId)
        validateIsNotNegativeInteger('streamPartition', streamPartition)
        validateIsArray('nodeIds', nodeIds)

        this.streamId = streamId
        this.streamPartition = streamPartition
        this.nodeIds = nodeIds
    }
}

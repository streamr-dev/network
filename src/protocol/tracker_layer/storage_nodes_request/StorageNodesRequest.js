import {
    validateIsNotEmptyString,
    validateIsNotNegativeInteger,
} from '../../../utils/validations'
import TrackerMessage from '../TrackerMessage'

export default class StorageNodesRequest extends TrackerMessage {
    constructor({ version = TrackerMessage.LATEST_VERSION, requestId, streamId, streamPartition }) {
        super(version, TrackerMessage.TYPES.StorageNodesRequest, requestId)

        validateIsNotEmptyString('streamId', streamId)
        validateIsNotNegativeInteger('streamPartition', streamPartition)

        this.streamId = streamId
        this.streamPartition = streamPartition
    }
}

import {
    validateIsNotEmptyString,
    validateIsNotNegativeInteger,
} from '../../../utils/validations'
import TrackerMessage, { TrackerMessageOptions } from '../TrackerMessage'

export interface Options extends TrackerMessageOptions {
    streamId: string
    streamPartition: number
}

export default class StorageNodesRequest extends TrackerMessage {

    streamId: string
    streamPartition: number

    constructor({ version = TrackerMessage.LATEST_VERSION, requestId, streamId, streamPartition }: Options) {
        super(version, TrackerMessage.TYPES.StorageNodesRequest, requestId)

        validateIsNotEmptyString('streamId', streamId)
        validateIsNotNegativeInteger('streamPartition', streamPartition)

        this.streamId = streamId
        this.streamPartition = streamPartition
    }
}

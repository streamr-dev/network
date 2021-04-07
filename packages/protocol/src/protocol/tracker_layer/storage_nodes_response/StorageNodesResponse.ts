import {
    validateIsNotEmptyString,
    validateIsNotNegativeInteger,
    validateIsArray
} from '../../../utils/validations'
import TrackerMessage, { TrackerMessageOptions } from '../TrackerMessage'

export interface Options extends TrackerMessageOptions {
    streamId: string
    streamPartition: number,
    nodeIds: string[]
}

export default class StorageNodesResponse extends TrackerMessage {

    streamId: string
    streamPartition: number
    nodeIds: string[]

    constructor({ version = TrackerMessage.LATEST_VERSION, requestId, streamId, streamPartition, nodeIds }: Options) {
        super(version, TrackerMessage.TYPES.StorageNodesResponse, requestId)

        validateIsNotEmptyString('streamId', streamId)
        validateIsNotNegativeInteger('streamPartition', streamPartition)
        validateIsArray('nodeIds', nodeIds)

        this.streamId = streamId
        this.streamPartition = streamPartition
        this.nodeIds = nodeIds
    }
}

import {
    validateIsNotEmptyString,
    validateIsNotNegativeInteger,
    validateIsArray
} from '../../../utils/validations'
import TrackerMessage, { TrackerMessageOptions } from '../TrackerMessage'
import { StreamID } from '../../../utils'
import { StreamPartitionID, StreamPartitionIDUtils } from "../../../utils"

export interface Options extends TrackerMessageOptions {
    streamId: StreamID
    streamPartition: number
    nodeIds: string[]
    counter: number
}

export default class InstructionMessage extends TrackerMessage {

    streamId: StreamID
    streamPartition: number
    nodeIds: string[]
    counter: number

    constructor({ version = TrackerMessage.LATEST_VERSION, requestId, streamId, streamPartition, nodeIds, counter }: Options) {
        super(version, TrackerMessage.TYPES.InstructionMessage, requestId)

        validateIsNotEmptyString('streamId', streamId)
        validateIsNotNegativeInteger('streamPartition', streamPartition)
        validateIsArray('nodeIds', nodeIds)
        validateIsNotNegativeInteger('counter', counter)

        this.streamId = streamId
        this.streamPartition = streamPartition
        this.nodeIds = nodeIds
        this.counter = counter
    }

    getStreamPartitionID(): StreamPartitionID {
        return StreamPartitionIDUtils.toStreamPartitionID(this.streamId, this.streamPartition)
    }
}

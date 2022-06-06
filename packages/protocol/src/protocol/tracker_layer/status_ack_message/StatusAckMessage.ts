import { validateIsNotEmptyString, validateIsNotNegativeInteger } from '../../../utils/validations'
import TrackerMessage, { TrackerMessageOptions } from '../TrackerMessage'
import { StreamID } from '../../../utils'
import { StreamPartID } from "../../../utils"
import { toStreamPartID } from "../../../utils/StreamPartID"

export interface Options extends TrackerMessageOptions {
    streamId: StreamID
    streamPartition: number
    counter: number
}

export default class StatusAckMessage extends TrackerMessage {

    streamId: StreamID
    streamPartition: number
    counter: number

    constructor({ version = TrackerMessage.LATEST_VERSION, requestId, streamId, streamPartition, counter }: Options) {
        super(version, TrackerMessage.TYPES.StatusAckMessage, requestId)

        validateIsNotEmptyString('streamId', streamId)
        validateIsNotNegativeInteger('streamPartition', streamPartition)
        validateIsNotNegativeInteger('counter', counter)

        this.streamId = streamId
        this.streamPartition = streamPartition
        this.counter = counter
    }

    getStreamPartID(): StreamPartID {
        return toStreamPartID(this.streamId, this.streamPartition)
    }
}

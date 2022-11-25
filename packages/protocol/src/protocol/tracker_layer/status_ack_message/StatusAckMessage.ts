import { validateIsNotEmptyString, validateIsNotNegativeInteger } from '../../../utils/validations'
import TrackerMessage, { TrackerMessageOptions } from '../TrackerMessage'
import { StreamID } from '../../../utils/exports'
import { StreamPartID } from "../../../utils/exports"
import { toStreamPartID } from "../../../utils/StreamPartID"

export interface Options extends TrackerMessageOptions {
    streamId: StreamID
    streamPartition: number
}

export default class StatusAckMessage extends TrackerMessage {

    streamId: StreamID
    streamPartition: number

    constructor({ version = TrackerMessage.LATEST_VERSION, requestId, streamId, streamPartition }: Options) {
        super(version, TrackerMessage.TYPES.StatusAckMessage, requestId)

        validateIsNotEmptyString('streamId', streamId)
        validateIsNotNegativeInteger('streamPartition', streamPartition)

        this.streamId = streamId
        this.streamPartition = streamPartition
    }

    getStreamPartID(): StreamPartID {
        return toStreamPartID(this.streamId, this.streamPartition)
    }
}

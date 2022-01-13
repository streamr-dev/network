import ControlMessage, { ControlMessageOptions } from '../ControlMessage'
import { validateIsInteger, validateIsNotNullOrUndefined, validateIsString } from '../../../utils/validations'
import { StreamID } from '../../../utils/StreamID'
import { StreamPartID, StreamPartIDUtils } from "../../../utils"

interface Options extends ControlMessageOptions {
    senderId: string
    streamId: StreamID
    streamPartition: number
}

export default class PublishStreamConnectionRequest extends ControlMessage {
    senderId: string
    streamId: StreamID
    streamPartition: number

    constructor({ version = ControlMessage.LATEST_VERSION, requestId, senderId, streamId, streamPartition }: Options) {
        super(version, ControlMessage.TYPES.PublishStreamConnectionRequest, requestId)

        validateIsNotNullOrUndefined('senderId', senderId)
        this.senderId = senderId

        validateIsString('streamId', streamId)
        this.streamId = streamId

        validateIsInteger('streamPartition', streamPartition)
        this.streamPartition = streamPartition
    }

    getStreamPartID(): StreamPartID {
        return StreamPartIDUtils.toStreamPartID(this.streamId, this.streamPartition)
    }
}

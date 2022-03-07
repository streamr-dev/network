import ControlMessage, { ControlMessageOptions } from '../ControlMessage'
import { validateIsInteger, validateIsNotNullOrUndefined, validateIsString } from '../../../utils/validations'
import { StreamID } from '../../../utils/StreamID'
import { StreamPartID, toStreamPartID } from "../../../utils/StreamPartID"

interface Options extends ControlMessageOptions {
    senderId: string
    streamId: StreamID
    streamPartition: number
}

export default class ProxyPublishStreamConnectionRequest extends ControlMessage {
    senderId: string
    streamId: StreamID
    streamPartition: number

    constructor({ version = ControlMessage.LATEST_VERSION, requestId, senderId, streamId, streamPartition }: Options) {
        super(version, ControlMessage.TYPES.ProxyPublishStreamConnectionRequest, requestId)

        validateIsNotNullOrUndefined('senderId', senderId)
        this.senderId = senderId

        validateIsString('streamId', streamId)
        this.streamId = streamId

        validateIsInteger('streamPartition', streamPartition)
        this.streamPartition = streamPartition
    }

    getStreamPartID(): StreamPartID {
        return toStreamPartID(this.streamId, this.streamPartition)
    }
}

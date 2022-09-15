import ControlMessage, { ControlMessageOptions } from '../ControlMessage'
import {
    validateIsDirection,
    validateIsInteger,
    validateIsNotNullOrUndefined,
    validateIsString
} from '../../../utils/validations'
import { StreamID } from '../../../utils/StreamID'
import { StreamPartID, toStreamPartID } from '../../../utils/StreamPartID'
import { ProxyDirection } from '../../../utils/types'

interface Options extends ControlMessageOptions {
    senderId: string
    streamId: StreamID
    streamPartition: number
    direction: ProxyDirection
    userId: string
}

export default class ProxyConnectionRequest extends ControlMessage {
    senderId: string
    streamId: StreamID
    streamPartition: number
    direction: ProxyDirection
    userId: string

    constructor({ version = ControlMessage.LATEST_VERSION, requestId, senderId, streamId, streamPartition, direction, userId }: Options) {
        super(version, ControlMessage.TYPES.ProxyConnectionRequest, requestId)

        validateIsNotNullOrUndefined('senderId', senderId)
        this.senderId = senderId

        validateIsString('streamId', streamId)
        this.streamId = streamId

        validateIsInteger('streamPartition', streamPartition)
        this.streamPartition = streamPartition

        validateIsDirection('direction', direction)
        this.direction = direction

        validateIsString('userId', userId)
        this.userId = userId
    }

    getStreamPartID(): StreamPartID {
        return toStreamPartID(this.streamId, this.streamPartition)
    }
}

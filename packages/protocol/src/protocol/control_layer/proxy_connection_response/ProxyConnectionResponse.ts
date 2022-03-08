import ControlMessage, { ControlMessageOptions } from '../ControlMessage'
import {
    validateIsDirection,
    validateIsInteger,
    validateIsNotNullOrUndefined,
    validateIsString
} from '../../../utils/validations'
import { StreamID } from '../../../utils/StreamID'
import { StreamPartID, toStreamPartID } from "../../../utils"
import { ProxyDirection } from '../../../utils/types'

interface Options extends ControlMessageOptions {
    senderId: string
    streamId: StreamID
    streamPartition: number
    direction: ProxyDirection
    accepted: boolean
}

export default class ProxyConnectionResponse extends ControlMessage {
    senderId: string
    streamId: StreamID
    streamPartition: number
    direction: ProxyDirection
    accepted: boolean

    constructor({ version = ControlMessage.LATEST_VERSION, requestId, senderId, streamId, streamPartition, direction, accepted }: Options) {
        super(version, ControlMessage.TYPES.ProxyConnectionResponse, requestId)

        validateIsNotNullOrUndefined('senderId', senderId)
        this.senderId = senderId

        validateIsString('streamId', streamId)
        this.streamId = streamId

        validateIsInteger('streamPartition', streamPartition)
        this.streamPartition = streamPartition

        validateIsNotNullOrUndefined('accepted', accepted)
        this.accepted = accepted

        validateIsDirection('direction', direction)
        this.direction = direction
    }

    getStreamPartID(): StreamPartID {
        return toStreamPartID(this.streamId, this.streamPartition)
    }
}

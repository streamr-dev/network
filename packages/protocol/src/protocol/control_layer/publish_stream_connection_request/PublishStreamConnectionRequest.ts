import ControlMessage, { ControlMessageOptions } from '../ControlMessage'
import { validateIsInteger, validateIsNotNullOrUndefined, validateIsString } from '../../../utils/validations'

interface Options extends ControlMessageOptions {
    senderId: string
    streamId: string
    streamPartition: number
}

export default class PublishStreamConnectionRequest extends ControlMessage {
    senderId: string
    streamId: string
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
}

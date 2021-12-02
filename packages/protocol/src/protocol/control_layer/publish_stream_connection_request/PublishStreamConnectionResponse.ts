import ControlMessage, { ControlMessageOptions } from '../ControlMessage'
import {validateIsInteger, validateIsNotNullOrUndefined, validateIsString} from '../../../utils/validations'

interface Options extends ControlMessageOptions {
    senderId: string
    streamId: string
    streamPartition: number
    accepted: boolean
}

export default class PublishStreamConnectionResponse extends ControlMessage {
    senderId: string
    streamId: string
    streamPartition: number
    accepted: boolean

    constructor({ version = ControlMessage.LATEST_VERSION, requestId, senderId, streamId, streamPartition, accepted }: Options) {
        super(version, ControlMessage.TYPES.PublishStreamConnectionResponse, requestId)

        validateIsNotNullOrUndefined('senderId', senderId)
        this.senderId = senderId

        validateIsString('streamId', streamId)
        this.streamId = streamId

        validateIsInteger('streamPartition', streamPartition)
        this.streamPartition = streamPartition

        validateIsNotNullOrUndefined('accepted', accepted)
        this.accepted = accepted
    }
}

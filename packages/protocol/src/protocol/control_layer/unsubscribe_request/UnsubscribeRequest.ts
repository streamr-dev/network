import { validateIsNotEmptyString, validateIsNotNegativeInteger } from '../../../utils/validations'
import ControlMessage, { ControlMessageOptions } from '../ControlMessage'
import { StreamID } from '../../../utils/StreamID'

export interface Options extends ControlMessageOptions {
    streamId: StreamID
    streamPartition: number
}

export default class UnsubscribeRequest extends ControlMessage {

    streamId: StreamID
    streamPartition: number

    constructor({ version = ControlMessage.LATEST_VERSION, requestId, streamId, streamPartition }: Options) {
        super(version, ControlMessage.TYPES.UnsubscribeRequest, requestId)

        validateIsNotEmptyString('streamId', streamId)
        validateIsNotNegativeInteger('streamPartition', streamPartition)

        this.streamId = streamId
        this.streamPartition = streamPartition
    }
}

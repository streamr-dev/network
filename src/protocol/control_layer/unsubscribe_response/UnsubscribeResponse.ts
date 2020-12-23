import ControlMessage, { ControlMessageOptions } from '../ControlMessage'
import { validateIsNotEmptyString, validateIsNotNegativeInteger } from '../../../utils/validations'

export interface Options extends ControlMessageOptions {
    streamId: string
    streamPartition: number
}

export default class UnsubscribeResponse extends ControlMessage {
    
    streamId: string
    streamPartition: number

    constructor({ version = ControlMessage.LATEST_VERSION, requestId, streamId, streamPartition }: Options) {
        super(version, ControlMessage.TYPES.UnsubscribeResponse, requestId)

        validateIsNotEmptyString('streamId', streamId)
        validateIsNotNegativeInteger('streamPartition', streamPartition)

        this.streamId = streamId
        this.streamPartition = streamPartition
    }
}

import ControlMessage, { ControlMessageOptions } from '../ControlMessage'
import { validateIsNotEmptyString, validateIsNotNegativeInteger } from '../../../utils/validations'

export interface Options extends ControlMessageOptions {
    streamId: string
    streamPartition: number
}

export default class ResendResponseResending extends ControlMessage {

    streamId: string
    streamPartition: number

    constructor({ version = ControlMessage.LATEST_VERSION, requestId, streamId, streamPartition }: Options) {
        super(version, ControlMessage.TYPES.ResendResponseResending, requestId)

        validateIsNotEmptyString('streamId', streamId)
        validateIsNotNegativeInteger('streamPartition', streamPartition)

        this.streamId = streamId
        this.streamPartition = streamPartition

        validateIsNotEmptyString('requestId', requestId) // unnecessary line once V1 is dropped
    }
}

import ControlMessage, { ControlMessageOptions } from '../ControlMessage'
import { validateIsNotEmptyString, validateIsNotNegativeInteger } from '../../../utils/validations'

export interface Options extends ControlMessageOptions {
    streamId: string
    streamPartition: number
}

export default class ResendResponseResent extends ControlMessage {

    streamId: string
    streamPartition: number

    constructor({ version, requestId, streamId, streamPartition }: Options) {
        super(version, ControlMessage.TYPES.ResendResponseResent, requestId)

        validateIsNotEmptyString('streamId', streamId)
        validateIsNotNegativeInteger('streamPartition', streamPartition)

        this.streamId = streamId
        this.streamPartition = streamPartition

        validateIsNotEmptyString('requestId', requestId) // unnecessary line once V1 is dropped
    }
}

import ControlMessage, { ControlMessageOptions } from '../ControlMessage'
import { validateIsNotEmptyString, validateIsNotNegativeInteger } from '../../../utils/validations'
import { StreamID } from '../../../utils/StreamID'

export interface Options extends ControlMessageOptions {
    streamId: StreamID
    streamPartition: number
}

export default class ResendResponseResent extends ControlMessage {

    streamId: StreamID
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

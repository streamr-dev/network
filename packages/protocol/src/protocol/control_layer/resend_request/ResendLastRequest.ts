import ControlMessage, { ControlMessageOptions } from '../ControlMessage'
import { validateIsNotEmptyString, validateIsNotNegativeInteger, validateIsString } from '../../../utils/validations'
import { StreamID } from '../../../utils/StreamID'

export interface Options extends ControlMessageOptions {
    streamId: StreamID
    streamPartition: number
    numberLast: number
    sessionToken: string | null
}

export default class ResendLastRequest extends ControlMessage {

    streamId: StreamID
    streamPartition: number
    numberLast: number
    sessionToken: string | null

    constructor({ version = ControlMessage.LATEST_VERSION, requestId, streamId, streamPartition, numberLast, sessionToken }: Options) {
        super(version, ControlMessage.TYPES.ResendLastRequest, requestId)

        validateIsNotEmptyString('streamId', streamId)
        validateIsNotNegativeInteger('streamPartition', streamPartition)
        validateIsNotNegativeInteger('numberLast', numberLast)
        validateIsString('sessionToken', sessionToken, true)

        this.streamId = streamId
        this.streamPartition = streamPartition
        this.numberLast = numberLast
        this.sessionToken = sessionToken

        validateIsNotEmptyString('requestId', requestId) // unnecessary line once V1 is dropped
    }
}

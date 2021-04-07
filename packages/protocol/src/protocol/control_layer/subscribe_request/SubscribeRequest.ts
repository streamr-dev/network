import { validateIsNotEmptyString, validateIsNotNegativeInteger, validateIsString } from '../../../utils/validations'
import ControlMessage, { ControlMessageOptions } from '../ControlMessage'

export interface Options extends ControlMessageOptions {
    streamId: string
    streamPartition: number
    sessionToken: string | null
}

export default class SubscribeRequest extends ControlMessage {

    streamId: string
    streamPartition: number
    sessionToken: string | null

    constructor({version = ControlMessage.LATEST_VERSION, requestId, streamId, streamPartition, sessionToken}: Options) {
        super(version, ControlMessage.TYPES.SubscribeRequest, requestId)

        validateIsNotEmptyString('streamId', streamId)
        validateIsNotNegativeInteger('streamPartition', streamPartition)
        validateIsString('sessionToken', sessionToken, true)

        this.streamId = streamId
        this.streamPartition = streamPartition
        this.sessionToken = sessionToken
    }
}

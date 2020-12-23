import { validateIsNotEmptyString, validateIsType } from '../../../utils/validations'
import ControlMessage, { ControlMessageOptions } from '../ControlMessage'
import StreamMessage from '../../message_layer/StreamMessage'

export interface Options extends ControlMessageOptions {
    streamMessage: StreamMessage
}

export default class UnicastMessage extends ControlMessage {

    streamMessage: StreamMessage

    constructor({ version = ControlMessage.LATEST_VERSION, requestId, streamMessage }: Options) {
        super(version, ControlMessage.TYPES.UnicastMessage, requestId)

        validateIsType('streamMessage', streamMessage, 'StreamMessage', StreamMessage)
        this.streamMessage = streamMessage

        validateIsNotEmptyString('requestId', requestId) // unnecessary line once V1 is dropped
    }
}

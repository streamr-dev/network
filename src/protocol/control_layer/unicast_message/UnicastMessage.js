import { validateIsNotEmptyString, validateIsType } from '../../../utils/validations'
import ControlMessage from '../ControlMessage'
import StreamMessage from '../../message_layer/StreamMessage'

export default class UnicastMessage extends ControlMessage {
    constructor(version, requestId, streamMessage) {
        super(version, ControlMessage.TYPES.UnicastMessage, requestId)

        validateIsType('streamMessage', streamMessage, 'StreamMessage', StreamMessage)
        this.streamMessage = streamMessage

        validateIsNotEmptyString('requestId', requestId) // unnecessary line once V1 is dropped
    }

    static create(requestId, streamMessage) {
        return new UnicastMessage(ControlMessage.LATEST_VERSION, requestId, streamMessage)
    }
}

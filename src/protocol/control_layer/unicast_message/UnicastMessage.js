import { validateIsNotEmptyString, validateIsType } from '../../../utils/validations'
import ControlMessage from '../ControlMessage'
import StreamMessage from '../../message_layer/StreamMessage'

export default class UnicastMessage extends ControlMessage {
    constructor({ version = ControlMessage.LATEST_VERSION, requestId, streamMessage }) {
        super(version, ControlMessage.TYPES.UnicastMessage, requestId)

        validateIsType('streamMessage', streamMessage, 'StreamMessage', StreamMessage)
        this.streamMessage = streamMessage

        validateIsNotEmptyString('requestId', requestId) // unnecessary line once V1 is dropped
    }
}

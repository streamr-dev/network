import ControlMessage from '../ControlMessage'
import { validateIsType } from '../../../utils/validations'
import StreamMessage from '../../message_layer/StreamMessage'

export default class BroadcastMessage extends ControlMessage {
    constructor({ version = ControlMessage.LATEST_VERSION, requestId, streamMessage }) {
        super(version, ControlMessage.TYPES.BroadcastMessage, requestId)

        validateIsType('streamMessage', streamMessage, 'StreamMessage', StreamMessage)
        this.streamMessage = streamMessage
    }
}

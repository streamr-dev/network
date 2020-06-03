import ControlMessage from '../ControlMessage'
import { validateIsNotNullOrUndefined, validateIsString } from '../../../utils/validations'

export default class PublishRequest extends ControlMessage {
    constructor({ version = ControlMessage.LATEST_VERSION, requestId, streamMessage, sessionToken }) {
        super(version, ControlMessage.TYPES.PublishRequest, requestId)

        validateIsNotNullOrUndefined('streamMessage', streamMessage)
        this.streamMessage = streamMessage

        validateIsString('sessionToken', sessionToken, true)
        this.sessionToken = sessionToken
    }
}

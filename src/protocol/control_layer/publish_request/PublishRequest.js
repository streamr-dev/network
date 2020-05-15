import ControlMessage from '../ControlMessage'
import { validateIsNotNullOrUndefined, validateIsString } from '../../../utils/validations'

export default class PublishRequest extends ControlMessage {
    constructor(version, requestId, streamMessage, sessionToken) {
        super(version, ControlMessage.TYPES.PublishRequest, requestId)

        validateIsNotNullOrUndefined('streamMessage', streamMessage)
        this.streamMessage = streamMessage

        validateIsString('sessionToken', sessionToken, true)
        this.sessionToken = sessionToken
    }

    static create(requestId, streamMessage, sessionToken) {
        return new PublishRequest(ControlMessage.LATEST_VERSION, requestId, streamMessage, sessionToken)
    }
}

import ControlMessage, { ControlMessageOptions } from '../ControlMessage'
import { validateIsNotNullOrUndefined, validateIsString } from '../../../utils/validations'
import StreamMessage from '../../message_layer/StreamMessage'

interface Options extends ControlMessageOptions {
    streamMessage: StreamMessage
    sessionToken: string | null
}

export default class PublishRequest extends ControlMessage {

    streamMessage: StreamMessage
    sessionToken: string | null

    constructor({ version = ControlMessage.LATEST_VERSION, requestId, streamMessage, sessionToken }: Options) {
        super(version, ControlMessage.TYPES.PublishRequest, requestId)

        validateIsNotNullOrUndefined('streamMessage', streamMessage)
        this.streamMessage = streamMessage

        validateIsString('sessionToken', sessionToken, true)
        this.sessionToken = sessionToken
    }
}

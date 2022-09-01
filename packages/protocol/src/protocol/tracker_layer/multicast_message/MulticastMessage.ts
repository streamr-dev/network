import {
    validateIsNotEmptyString,
    validateIsNotNullOrUndefined
} from '../../../utils/validations'
import TrackerMessage, { TrackerMessageOptions } from '../TrackerMessage'
import StreamMessage from '../../message_layer/StreamMessage'

export interface Options extends TrackerMessageOptions {
    senderNodeId: string
    recipientUserId: string
    payload: StreamMessage
}

export default class MulticastMessage extends TrackerMessage {
    senderNodeId: string
    recipientUserId: string
    payload: StreamMessage

    constructor({ version = TrackerMessage.LATEST_VERSION, requestId, senderNodeId, recipientUserId: recipientNodeId, payload }: Options) {
        super(version, TrackerMessage.TYPES.MulticastMessage, requestId)

        validateIsNotEmptyString('senderNodeId', senderNodeId)
        validateIsNotEmptyString('recipientUserId', recipientNodeId)
        validateIsNotNullOrUndefined('payload', payload)

        this.senderNodeId = senderNodeId
        this.recipientUserId = recipientNodeId
        this.payload = payload
    }
}

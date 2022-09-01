import {
    validateIsNotEmptyString,
    validateIsNotNullOrUndefined
} from '../../../utils/validations'
import TrackerMessage, { TrackerMessageOptions } from '../TrackerMessage'
import StreamMessage from '../../message_layer/StreamMessage'

export interface Options extends TrackerMessageOptions {
    senderNodeId: string
    recipientNodeId: string
    payload: StreamMessage
}

export default class UnicastMessage extends TrackerMessage {
    senderNodeId: string
    recipientNodeId: string
    payload: StreamMessage

    constructor({ version = TrackerMessage.LATEST_VERSION, requestId, senderNodeId, recipientNodeId, payload }: Options) {
        super(version, TrackerMessage.TYPES.UnicastMessage, requestId)

        validateIsNotEmptyString('senderNodeId', senderNodeId)
        validateIsNotEmptyString('recipientNodeId', recipientNodeId)
        validateIsNotNullOrUndefined('payload', payload)

        this.senderNodeId = senderNodeId
        this.recipientNodeId = recipientNodeId
        this.payload = payload
    }
}

import { validateIsArray, validateIsString } from '../../utils/validations'

import StreamMessage from './StreamMessage'
import GroupKeyMessage from './GroupKeyMessage'

export default class GroupKeyErrorResponse extends GroupKeyMessage {
    constructor({
        requestId, streamId, errorCode, errorMessage, groupKeyIds
    }) {
        super(streamId, StreamMessage.MESSAGE_TYPES.GROUP_KEY_ERROR_RESPONSE)

        validateIsString('requestId', requestId)
        this.requestId = requestId

        validateIsString('errorCode', errorCode)
        this.errorCode = errorCode

        validateIsString('errorMessage', errorMessage)
        this.errorMessage = errorMessage

        validateIsArray('groupKeyIds', groupKeyIds)
        this.groupKeyIds = groupKeyIds
    }

    toArray() {
        return [this.requestId, this.streamId, this.errorCode, this.errorMessage, this.groupKeyIds]
    }

    static fromArray(arr) {
        const [requestId, streamId, errorCode, errorMessage, groupKeyIds] = arr
        return new GroupKeyErrorResponse({
            requestId,
            streamId,
            errorCode,
            errorMessage,
            groupKeyIds,
        })
    }
}

GroupKeyMessage.classByMessageType[StreamMessage.MESSAGE_TYPES.GROUP_KEY_ERROR_RESPONSE] = GroupKeyErrorResponse

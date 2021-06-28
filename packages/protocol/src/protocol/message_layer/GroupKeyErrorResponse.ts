import { validateIsArray, validateIsString } from '../../utils/validations'

import StreamMessage from './StreamMessage'
import GroupKeyMessage from './GroupKeyMessage'

export enum ErrorCode {
    // TODO define the values, remove PLACEHOLDER
    PLACEHOLDER = 'PLACEHOLDER'
}

export interface Options {
    requestId: string
    streamId: string
    errorCode: ErrorCode
    errorMessage: string
    groupKeyIds: string[]
}

type GroupKeyErrorResponseSerialized = [string, string, ErrorCode, string, string[]]

export default class GroupKeyErrorResponse extends GroupKeyMessage {

    requestId: string
    errorCode: ErrorCode
    errorMessage: string
    groupKeyIds: string[]

    constructor({ requestId, streamId, errorCode, errorMessage, groupKeyIds }: Options) {
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

    toArray(): GroupKeyErrorResponseSerialized {
        return [this.requestId, this.streamId, this.errorCode, this.errorMessage, this.groupKeyIds]
    }

    static fromArray(arr: GroupKeyErrorResponseSerialized): GroupKeyErrorResponse {
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

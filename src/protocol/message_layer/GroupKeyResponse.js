import { validateIsArray, validateIsString } from '../../utils/validations'
import ValidationError from '../../errors/ValidationError'

import StreamMessage from './StreamMessage'
import GroupKeyMessage from './GroupKeyMessage'
import EncryptedGroupKey from './EncryptedGroupKey'

export default class GroupKeyResponse extends GroupKeyMessage {
    constructor({ requestId, streamId, encryptedGroupKeys }) {
        super(streamId, StreamMessage.MESSAGE_TYPES.GROUP_KEY_RESPONSE)

        validateIsString('requestId', requestId)
        this.requestId = requestId

        validateIsArray('encryptedGroupKeys', encryptedGroupKeys)
        this.encryptedGroupKeys = encryptedGroupKeys

        // Validate content of encryptedGroupKeys
        this.encryptedGroupKeys.forEach((it) => {
            if (!(it instanceof EncryptedGroupKey)) {
                throw new ValidationError(`Expected 'encryptedGroupKeys' to be a list of EncryptedGroupKey instances! Was: ${this.encryptedGroupKeys}`)
            }
        })
    }

    toArray() {
        return [this.requestId, this.streamId, this.encryptedGroupKeys.map((it) => it.toArray())]
    }

    static fromArray(arr) {
        const [requestId, streamId, encryptedGroupKeys] = arr
        return new GroupKeyResponse({
            requestId,
            streamId,
            encryptedGroupKeys: encryptedGroupKeys.map((it) => EncryptedGroupKey.fromArray(it)),
        })
    }
}

GroupKeyMessage.classByMessageType[StreamMessage.MESSAGE_TYPES.GROUP_KEY_RESPONSE] = GroupKeyResponse

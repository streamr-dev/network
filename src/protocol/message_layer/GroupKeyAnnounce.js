import { validateIsArray } from '../../utils/validations'
import ValidationError from '../../errors/ValidationError'

import GroupKeyMessage from './GroupKeyMessage'
import StreamMessage from './StreamMessage'
import EncryptedGroupKey from './EncryptedGroupKey'

export default class GroupKeyAnnounce extends GroupKeyMessage {
    constructor({ streamId, encryptedGroupKeys }) {
        super(streamId, StreamMessage.MESSAGE_TYPES.GROUP_KEY_ANNOUNCE)

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
        return [this.streamId, this.encryptedGroupKeys.map((it) => it.toArray())]
    }

    static fromArray(arr) {
        const [streamId, encryptedGroupKeys] = arr
        return new GroupKeyAnnounce({
            streamId,
            encryptedGroupKeys: encryptedGroupKeys.map((it) => EncryptedGroupKey.fromArray(it)),
        })
    }
}

GroupKeyMessage.classByMessageType[StreamMessage.MESSAGE_TYPES.GROUP_KEY_ANNOUNCE] = GroupKeyAnnounce

import { validateIsArray } from '../../utils/validations'

import GroupKeyMessage from './GroupKeyMessage'
import StreamMessage from './StreamMessage'
import EncryptedGroupKey, { EncryptedGroupKeySerialized } from './EncryptedGroupKey'
import { StreamID, toStreamID } from '../../../src/utils/StreamID'

export interface Options {
    streamId: StreamID
    encryptedGroupKeys: EncryptedGroupKey[]
}

type GroupKeyAnnounceSerialized = [string, EncryptedGroupKeySerialized[]]

export default class GroupKeyAnnounce extends GroupKeyMessage {

    encryptedGroupKeys: EncryptedGroupKey[]

    constructor({ streamId, encryptedGroupKeys }: Options) {
        super(streamId, StreamMessage.MESSAGE_TYPES.GROUP_KEY_ANNOUNCE)

        validateIsArray('encryptedGroupKeys', encryptedGroupKeys)
        this.encryptedGroupKeys = encryptedGroupKeys

        // Validate content of encryptedGroupKeys
        this.encryptedGroupKeys.forEach((it: EncryptedGroupKey) => {
            if (!(it instanceof EncryptedGroupKey)) {
                throw new Error(
                    `Expected 'encryptedGroupKeys' to be a list of EncryptedGroupKey instances! Was: ${this.encryptedGroupKeys}`
                )
            }
        })
    }

    toArray(): GroupKeyAnnounceSerialized {
        return [this.streamId, this.encryptedGroupKeys.map((it: EncryptedGroupKey)=> it.toArray())]
    }

    static fromArray(arr: GroupKeyAnnounceSerialized): GroupKeyAnnounce {
        const [streamId, encryptedGroupKeys] = arr
        return new GroupKeyAnnounce({
            streamId: toStreamID(streamId),
            encryptedGroupKeys: encryptedGroupKeys.map((it) => EncryptedGroupKey.fromArray(it)),
        })
    }

    static is(streamMessage: StreamMessage): streamMessage is StreamMessage<GroupKeyAnnounceSerialized> {
        return streamMessage.messageType === StreamMessage.MESSAGE_TYPES.GROUP_KEY_ERROR_RESPONSE
    }
}

GroupKeyMessage.classByMessageType[StreamMessage.MESSAGE_TYPES.GROUP_KEY_ANNOUNCE] = GroupKeyAnnounce

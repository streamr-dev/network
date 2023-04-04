import { EncryptionType, StreamMessage } from '@streamr/protocol'
import { EncryptionUtil, DecryptError } from '../encryption/EncryptionUtil'
import { DestroySignal } from '../DestroySignal'
import { GroupKey } from '../encryption/GroupKey'
import { GroupKeyManager } from '../encryption/GroupKeyManager'

// TODO if this.destroySignal.isDestroyed() is true, would it make sense to reject the promise
// and not to return the original encrypted message?
// - e.g. StoppedError, which is not visible to end-user
export const decrypt = async (
    streamMessage: StreamMessage,
    groupKeyManager: GroupKeyManager,
    destroySignal: DestroySignal,
): Promise<StreamMessage> => {
    if (destroySignal.isDestroyed()) {
        return streamMessage
    }
    let groupKey: GroupKey | undefined
    try {
        groupKey = await groupKeyManager.fetchKey(
            streamMessage.getStreamPartID(),
            streamMessage.groupKeyId!,
            streamMessage.getPublisherId()
        )
    } catch (e: any) {
        if (destroySignal.isDestroyed()) {
            return streamMessage
        }
        throw new DecryptError(streamMessage, `Could not get GroupKey ${streamMessage.groupKeyId}: ${e.message}`)
    }
    if (destroySignal.isDestroyed()) {
        return streamMessage
    }
    const clone = StreamMessage.deserialize(streamMessage.serialize())
    EncryptionUtil.decryptStreamMessage(clone, groupKey)
    if (streamMessage.newGroupKey) {
        // newGroupKey has been converted into GroupKey
        await groupKeyManager.addKeyToLocalStore(
            clone.newGroupKey as unknown as GroupKey,
            streamMessage.getPublisherId()
        )
    }
    return clone
}

// TODO this could be in protocol (and validate that if type==AES, we always have groupKeyId)
export const isEncrypted = (streamMessage: StreamMessage): boolean => {
    return ((streamMessage.encryptionType === EncryptionType.AES) && (streamMessage.groupKeyId !== null))
}

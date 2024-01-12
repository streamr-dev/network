import { StreamMessage, StreamMessageAESEncrypted } from '@streamr/protocol'
import { EncryptionUtil, DecryptError } from '../encryption/EncryptionUtil'
import { DestroySignal } from '../DestroySignal'
import { GroupKey } from '../encryption/GroupKey'
import { GroupKeyManager } from '../encryption/GroupKeyManager'

// TODO if this.destroySignal.isDestroyed() is true, would it make sense to reject the promise
// and not to return the original encrypted message?
// - e.g. StoppedError, which is not visible to end-user
export const decrypt = async (
    streamMessage: StreamMessageAESEncrypted,
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
            streamMessage.groupKeyId,
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
    const decryptedStreamMessage = EncryptionUtil.decryptStreamMessage(streamMessage, groupKey)
    if (decryptedStreamMessage.newGroupKey) {
        await groupKeyManager.addKeyToLocalStore(
            new GroupKey(
                decryptedStreamMessage.newGroupKey.groupKeyId,
                Buffer.from(decryptedStreamMessage.newGroupKey.data)
            ),
            streamMessage.getPublisherId()
        )
    }
    return decryptedStreamMessage
}

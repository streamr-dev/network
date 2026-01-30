import { EncryptionType } from '@streamr/trackerless-network'
import { DestroySignal } from '../DestroySignal'
import { GroupKey } from '../encryption/GroupKey'
import { GroupKeyManager } from '../encryption/GroupKeyManager'
import { EncryptionService } from '../encryption/EncryptionService'
import { StreamMessage, StreamMessageAESEncrypted } from '../protocol/StreamMessage'
import { StreamrClientError } from '../StreamrClientError'

// TODO if this.destroySignal.isDestroyed() is true, would it make sense to reject the promise
// and not to return the original encrypted message?
// - e.g. StoppedError, which is not visible to end-user
export const decrypt = async (
    streamMessage: StreamMessageAESEncrypted,
    groupKeyManager: GroupKeyManager,
    encryptionService: EncryptionService,
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
    } catch {
        if (destroySignal.isDestroyed()) {
            return streamMessage
        }
        throw new StreamrClientError(`Could not get encryption key ${streamMessage.groupKeyId}`, 'DECRYPT_ERROR', streamMessage)
    }
    if (destroySignal.isDestroyed()) {
        return streamMessage
    }
    
    let content: Uint8Array
    let newGroupKey: GroupKey | undefined
    try {
        [content, newGroupKey] = await encryptionService.decryptStreamMessage(
            streamMessage.content,
            groupKey,
            streamMessage.newGroupKey
        )
    } catch (err) {
        if (err instanceof StreamrClientError) {
            throw new StreamrClientError(err.message, 'DECRYPT_ERROR', streamMessage)
        }
        throw new StreamrClientError('AES decryption failed', 'DECRYPT_ERROR', streamMessage)
    }
    
    if (newGroupKey !== undefined) {
        await groupKeyManager.addKeyToLocalStore(newGroupKey, streamMessage.getPublisherId())
    }

    return new StreamMessage({
        ...streamMessage,
        content,
        encryptionType: EncryptionType.NONE
    })
}

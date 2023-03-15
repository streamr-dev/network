import { EncryptionType, StreamMessage } from '@streamr/protocol'
import { EncryptionUtil, DecryptError } from '../encryption/EncryptionUtil'
import { StreamRegistryCached } from '../registry/StreamRegistryCached'
import { DestroySignal } from '../DestroySignal'
import { GroupKey } from '../encryption/GroupKey'
import { Logger } from '@streamr/utils'
import { LoggerFactory } from '../utils/LoggerFactory'
import { GroupKeyManager } from '../encryption/GroupKeyManager'

export class Decrypt {

    private groupKeyManager: GroupKeyManager
    private streamRegistryCached: StreamRegistryCached
    private destroySignal: DestroySignal
    private readonly logger: Logger

    constructor(
        groupKeyManager: GroupKeyManager,
        streamRegistryCached: StreamRegistryCached,
        destroySignal: DestroySignal,
        loggerFactory: LoggerFactory,
    ) {
        this.groupKeyManager = groupKeyManager
        this.streamRegistryCached = streamRegistryCached
        this.destroySignal = destroySignal
        this.logger = loggerFactory.createLogger(module)
        this.decrypt = this.decrypt.bind(this)
    }

    // TODO if this.destroySignal.isDestroyed() is true, would it make sense to reject the promise
    // and not to return the original encrypted message?
    // - e.g. StoppedError, which is not visible to end-user
    async decrypt(streamMessage: StreamMessage): Promise<StreamMessage> {
        if (this.destroySignal.isDestroyed()) {
            return streamMessage
        }

        if (!streamMessage.groupKeyId) {
            return streamMessage
        }

        if (streamMessage.encryptionType !== EncryptionType.AES) {
            return streamMessage
        }

        try {
            let groupKey: GroupKey | undefined
            try {
                groupKey = await this.groupKeyManager.fetchKey(
                    streamMessage.getStreamPartID(),
                    streamMessage.groupKeyId,
                    streamMessage.getPublisherId()
                )
            } catch (e: any) {
                if (this.destroySignal.isDestroyed()) {
                    return streamMessage
                }
                throw new DecryptError(streamMessage, `Could not get GroupKey ${streamMessage.groupKeyId}: ${e.message}`)
            }
            if (this.destroySignal.isDestroyed()) {
                return streamMessage
            }

            const clone = StreamMessage.deserialize(streamMessage.serialize())
            EncryptionUtil.decryptStreamMessage(clone, groupKey)
            if (streamMessage.newGroupKey) {
                // newGroupKey has been converted into GroupKey
                await this.groupKeyManager.addKeyToLocalStore(
                    clone.newGroupKey as unknown as GroupKey,
                    streamMessage.getPublisherId()
                )
            }
            return clone
        } catch (err) {
            this.logger.debug('failed to decrypt message %j, reason: %s', streamMessage.getMessageID(), err)
            // clear cached permissions if cannot decrypt, likely permissions need updating
            this.streamRegistryCached.clearStream(streamMessage.getStreamId())
            throw err
        }
    }
}

/**
 * Encrypt StreamMessages in-place.
 */
import { StreamMessage } from 'streamr-client-protocol'
import { StreamRegistryCached } from '../registry/StreamRegistryCached'
import { scoped, Lifecycle } from 'tsyringe'
import { EncryptionUtil } from '../encryption/EncryptionUtil'
import { GroupKeyStoreFactory } from '../encryption/GroupKeyStoreFactory'

@scoped(Lifecycle.ContainerScoped)
export class Encrypt {
    private isStopped = false

    constructor(
        private streamRegistryCached: StreamRegistryCached,
        private groupKeyStoreFactory: GroupKeyStoreFactory
    ) {
    }

    async encrypt(streamMessage: StreamMessage): Promise<void> {
        if (this.isStopped) { return }

        if (StreamMessage.isEncrypted(streamMessage)) {
            // already encrypted
            return
        }

        if (streamMessage.messageType !== StreamMessage.MESSAGE_TYPES.MESSAGE) {
            return
        }

        const streamId = streamMessage.getStreamId()

        const isPublic = await this.streamRegistryCached.isPublic(streamId)
        if (isPublic || this.isStopped) {
            return
        }

        const groupKeyStore = await this.groupKeyStoreFactory.getStore(streamId)
        const [groupKey, nextGroupKey] = await groupKeyStore.useGroupKey()
        if (this.isStopped) { return }

        if (!groupKey) {
            throw new Error(`Tried to use group key but no group key found for stream: ${streamId}`)
        }

        EncryptionUtil.encryptStreamMessage(streamMessage, groupKey, nextGroupKey)
    }

    async start(): Promise<void> {
        this.isStopped = false
    }

    async stop(): Promise<void> {
        this.isStopped = true
    }
}

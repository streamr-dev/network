/**
 * Encrypt StreamMessages in-place.
 */
import { StreamMessage } from 'streamr-client-protocol'
import { PublisherKeyExchange } from '../encryption/KeyExchangePublisher'
import { StreamEndpointsCached } from '../StreamEndpointsCached'
import { scoped, Lifecycle, inject, delay } from 'tsyringe'
import { EncryptionUtil } from '../encryption/Encryption'
import { Ethereum } from '../Ethereum'
import { Stoppable } from '../utils/Stoppable'

@scoped(Lifecycle.ContainerScoped)
export class Encrypt implements Stoppable {
    isStopped = false

    constructor(
        private streamEndpoints: StreamEndpointsCached,
        @inject(delay(() => PublisherKeyExchange)) private keyExchange: PublisherKeyExchange,
        private ethereum: Ethereum,
    ) {
    }

    async encrypt(streamMessage: StreamMessage) {
        if (this.isStopped) { return }

        if (StreamMessage.isEncrypted(streamMessage)) {
            // already encrypted
            return
        }

        if (!this.ethereum.canEncrypt()) {
            return
        }

        const { messageType } = streamMessage
        if (
            messageType === StreamMessage.MESSAGE_TYPES.GROUP_KEY_RESPONSE
            || messageType === StreamMessage.MESSAGE_TYPES.GROUP_KEY_REQUEST
            || messageType === StreamMessage.MESSAGE_TYPES.GROUP_KEY_ERROR_RESPONSE
        ) {
            // never encrypt
            return
        }

        if (streamMessage.messageType !== StreamMessage.MESSAGE_TYPES.MESSAGE) {
            return
        }

        const streamId = streamMessage.getStreamId()

        const isPublic = await this.streamEndpoints.isPublic(streamId)
        if (isPublic || this.isStopped) {
            return
        }

        const stream = await this.streamEndpoints.getStream(streamId)

        if (!(await (this.keyExchange.hasAnyGroupKey(stream.id)))) {
            // not needed
            return
        }

        const [groupKey, nextGroupKey] = await this.keyExchange.useGroupKey(stream.id)
        if (this.isStopped) { return }

        if (!groupKey) {
            throw new Error(`Tried to use group key but no group key found for stream: ${stream.id}`)
        }

        EncryptionUtil.encryptStreamMessage(streamMessage, groupKey, nextGroupKey)
    }

    async start() {
        this.isStopped = false
    }

    async stop() {
        this.isStopped = true
    }
}

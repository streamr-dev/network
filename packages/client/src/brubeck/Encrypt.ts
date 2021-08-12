import { StreamMessage } from 'streamr-client-protocol'
import { PublisherKeyExhange } from './encryption/KeyExchangePublisher'
import { BrubeckCached } from './Cached'
import { scoped, Lifecycle } from 'tsyringe'
import EncryptionUtil from './encryption/Encryption'
import Ethereum from './Ethereum'
import { Stoppable } from '../utils/Stoppable'

@scoped(Lifecycle.ContainerScoped)
export default class PublisherEncryption implements Stoppable {
    isStopped = false

    constructor(
        private streamEndpoints: BrubeckCached,
        private keyExchange: PublisherKeyExhange,
        private ethereum: Ethereum,
    ) {
    }

    async encrypt(streamMessage: StreamMessage) {
        if (this.isStopped) { return }

        if (!this.ethereum.canEncrypt()) {
            return
        }

        const streamId = streamMessage.getStreamId()

        const { messageType } = streamMessage
        if (
            messageType === StreamMessage.MESSAGE_TYPES.GROUP_KEY_RESPONSE
            || messageType === StreamMessage.MESSAGE_TYPES.GROUP_KEY_REQUEST
            || messageType === StreamMessage.MESSAGE_TYPES.GROUP_KEY_ERROR_RESPONSE
        ) {
            // never encrypt
            return
        }

        const stream = await this.streamEndpoints.getStream(streamId)

        if (
            !stream.requireEncryptedData
            && !(await (this.keyExchange.hasAnyGroupKey(stream.id)))
        ) {
            // not needed
            return
        }

        if (streamMessage.messageType !== StreamMessage.MESSAGE_TYPES.MESSAGE) {
            return
        }

        const [groupKey, nextGroupKey] = await this.keyExchange.useGroupKey(streamId)
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

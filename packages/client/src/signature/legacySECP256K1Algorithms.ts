import { MessageSignerAlgorithm } from './MessageSigner'
import {
    EncryptedGroupKey,
    EncryptionType,
    MessageID,
    MessageRef,
    StreamMessage,
    StreamMessageOptions
} from '@streamr/protocol'
import { binaryToHex, binaryToUtf8, verifySignature } from '@streamr/utils'
import { Authentication } from '../Authentication'
import { MarkRequired } from 'ts-essentials'
import { SignatureValidatorAlgorithm } from './SignatureValidator'

const serializeGroupKey = ({ id, data }: EncryptedGroupKey): string => {
    return JSON.stringify([id, binaryToHex(data)])
}

const createLegacySignaturePayload = (opts: {
    messageId: MessageID
    content: Uint8Array
    encryptionType: EncryptionType
    prevMsgRef?: MessageRef
    newGroupKey?: EncryptedGroupKey
}): Uint8Array => {
    const prev = ((opts.prevMsgRef !== undefined) ? `${opts.prevMsgRef.timestamp}${opts.prevMsgRef.sequenceNumber}` : '')
    const newGroupKey = ((opts.newGroupKey !== undefined) ? serializeGroupKey(opts.newGroupKey) : '')
    // In the legacy signature type, encrypted content was signed as a hex-encoded string
    const contentAsString = (opts.encryptionType === EncryptionType.NONE)
        ? binaryToUtf8(opts.content)
        : binaryToHex(opts.content)
    return Buffer.from(`${opts.messageId.streamId}${opts.messageId.streamPartition}${opts.messageId.timestamp}${opts.messageId.sequenceNumber}`
        + `${opts.messageId.publisherId}${opts.messageId.msgChainId}${prev}${contentAsString}${newGroupKey}`)
}

export class LegacySECP256K1Algorithms implements MessageSignerAlgorithm {
    private readonly authentication: Authentication

    constructor(authentication: Authentication) {
        this.authentication = authentication
    }

    async sign(opts: MarkRequired<Omit<StreamMessageOptions, 'signature' | 'signatureType'>, 'messageType'>): Promise<Uint8Array> {
        const payload = createLegacySignaturePayload(opts)
        return this.authentication.createMessageSignature(payload)
    }
}

export class LegacySECP256K1Validator implements SignatureValidatorAlgorithm {
    // eslint-disable-next-line class-methods-use-this
    async assertSignatureIsValid(streamMessage: StreamMessage): Promise<boolean> {
        const payload = createLegacySignaturePayload(streamMessage)
        return verifySignature(streamMessage.getPublisherId(), payload, streamMessage.signature)
    }
}

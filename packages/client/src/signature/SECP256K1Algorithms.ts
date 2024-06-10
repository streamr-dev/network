import { MessageSignerAlgorithm } from './MessageSigner'
import { Authentication } from '../Authentication'
import { MarkRequired } from 'ts-essentials'
import { StreamMessage, StreamMessageOptions } from '@streamr/protocol'
import { createSignaturePayload } from './createSignaturePayload'
import { SignatureValidatorAlgorithm } from './SignatureValidator'
import { verifySignature } from '@streamr/utils'

export class SECP256K1Algorithms implements MessageSignerAlgorithm {
    private readonly authentication: Authentication

    constructor(authentication: Authentication) {
        this.authentication = authentication
    }

    async sign(opts: MarkRequired<Omit<StreamMessageOptions, 'signature' | 'signatureType'>, 'messageType'>): Promise<Uint8Array> {
        const payload = createSignaturePayload(opts)
        return this.authentication.signWithWallet(payload)
    }
}

export class SECP256K1Validator implements SignatureValidatorAlgorithm {
    // eslint-disable-next-line class-methods-use-this
    async assertSignatureIsValid(streamMessage: StreamMessage): Promise<boolean> {
        const payload = createSignaturePayload(streamMessage)
        return verifySignature(streamMessage.getPublisherId(), payload, streamMessage.signature)
    }

}

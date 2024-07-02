import { MarkRequired } from 'ts-essentials'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { Authentication, AuthenticationInjectionToken } from '../Authentication'
import { SignatureType, StreamMessage, StreamMessageOptions } from '../protocol/StreamMessage'
import { createSignaturePayload } from './createSignaturePayload'

@scoped(Lifecycle.ContainerScoped)
export class MessageSigner {
    private readonly authentication: Authentication

    constructor(@inject(AuthenticationInjectionToken) authentication: Authentication) {
        this.authentication = authentication
    }

    async createSignedMessage(
        opts: MarkRequired<Omit<StreamMessageOptions, 'signature' | 'signatureType'>, 'messageType'>,
        signatureType: SignatureType
    ): Promise<StreamMessage> {
        const signature = await this.sign(opts, signatureType)
        return new StreamMessage({
            ...opts,
            signature,
            signatureType
        })
    }

    private sign(
        opts: MarkRequired<Omit<StreamMessageOptions, 'signature' | 'signatureType'>, 'messageType'>,
        signatureType: SignatureType
    ): Promise<Uint8Array> {
        switch (signatureType) {
            case SignatureType.SECP256K1:
            case SignatureType.ERC_1271:
                return this.authentication.createMessageSignature(createSignaturePayload(opts))
            default:
                throw new Error(`Cannot sign message, unsupported signatureType: "${signatureType}"`)
        }
    }
}

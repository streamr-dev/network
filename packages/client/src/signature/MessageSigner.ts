import { inject, Lifecycle, scoped } from 'tsyringe'
import { MarkRequired } from 'ts-essentials'
import { SignatureType, StreamMessage, StreamMessageOptions } from '@streamr/protocol'
import { Authentication, AuthenticationInjectionToken } from '../Authentication'
import { createSignaturePayload } from './createSignaturePayload'
import { createLegacySignaturePayload } from './createLegacySignaturePayload'

type SignerFn = (opts: MarkRequired<Omit<StreamMessageOptions, 'signature' | 'signatureType'>, 'messageType'>) => Promise<Uint8Array>

@scoped(Lifecycle.ContainerScoped)
export class MessageSigner {
    private readonly signers = new Map<SignatureType, SignerFn>()

    constructor(@inject(AuthenticationInjectionToken) authentication: Authentication) {
        this.signers.set(SignatureType.LEGACY_SECP256K1, (opts) => {
            const payload = createLegacySignaturePayload(opts)
            return authentication.signWithWallet(payload)
        })
        this.signers.set(SignatureType.SECP256K1, (opts) => {
            const payload = createSignaturePayload(opts)
            return authentication.signWithWallet(payload)
        })
        this.signers.set(SignatureType.ERC_1271, this.signers.get(SignatureType.SECP256K1)!)
    }

    async createSignedMessage(
        opts: MarkRequired<Omit<StreamMessageOptions, 'signature' | 'signatureType'>, 'messageType'>,
        signatureType: SignatureType
    ): Promise<StreamMessage> {
        const sign = this.signers.get(signatureType)
        if (sign === undefined) {
            throw new Error(`Cannot sign message, unsupported signatureType: "${signatureType}"`)
        }
        const signature = await sign(opts)
        return new StreamMessage({
            ...opts,
            signature,
            signatureType,
            content: opts.content
        })
    }
}

import { inject, Lifecycle, scoped } from 'tsyringe'
import { MarkRequired } from 'ts-essentials'
import { SignatureType, StreamMessage, StreamMessageOptions } from '@streamr/protocol'
import { Authentication, AuthenticationInjectionToken } from '../Authentication'
import { LegacySECP256K1Algorithms } from './legacySECP256K1Algorithms'
import { SECP256K1Algorithms } from './SECP256K1Algorithms'

export interface MessageSignerAlgorithm {
    sign(opts: MarkRequired<Omit<StreamMessageOptions, 'signature' | 'signatureType'>, 'messageType'>): Promise<Uint8Array>
}

@scoped(Lifecycle.ContainerScoped)
export class MessageSigner {
    private readonly signerAlgorithms = new Map<SignatureType, MessageSignerAlgorithm>()

    constructor(@inject(AuthenticationInjectionToken) authentication: Authentication) {
        this.signerAlgorithms.set(SignatureType.LEGACY_SECP256K1, new LegacySECP256K1Algorithms(authentication)) // TODO: where to register?
        this.signerAlgorithms.set(SignatureType.SECP256K1, new SECP256K1Algorithms(authentication)) // TODO: where to register?
        this.signerAlgorithms.set(SignatureType.ERC_1271, new SECP256K1Algorithms(authentication)) // TODO: where to register?
    }

    async createSignedMessage(
        opts: MarkRequired<Omit<StreamMessageOptions, 'signature' | 'signatureType'>, 'messageType'>,
        signatureType: SignatureType
    ): Promise<StreamMessage> {
        const signerAlgorithm = this.signerAlgorithms.get(signatureType)
        if (signerAlgorithm === undefined) {
            throw new Error(`Unsupported SignatureType: ${SignatureType}`)
        }
        const signature = await signerAlgorithm.sign(opts)
        return new StreamMessage({
            ...opts,
            signature,
            signatureType,
            content: opts.content
        })
    }
}

import { MarkRequired } from 'ts-essentials'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { Identity, IdentityInjectionToken } from '../identity/Identity'
import { StreamMessage, StreamMessageOptions } from '../protocol/StreamMessage'
import { createSignaturePayload } from './createSignaturePayload'
import { SignatureType } from '@streamr/trackerless-network'
import { SigningService } from './SigningService'

@scoped(Lifecycle.ContainerScoped)
export class MessageSigner {
    private readonly identity: Identity
    private readonly signingService: SigningService

    constructor(
        @inject(IdentityInjectionToken) identity: Identity,
            signingService: SigningService
    ) {
        this.identity = identity
        this.signingService = signingService
    }

    async createSignedMessage(
        opts: MarkRequired<Omit<StreamMessageOptions, 'signature' | 'signatureType'>, 'messageType'>,
        signatureType: SignatureType
    ): Promise<StreamMessage> {
        let signature: Uint8Array

        // Use worker-based signing if identity provides a private key and signature type supports it
        // ERC-1271 signatures require on-chain verification and must be handled by the identity directly
        const privateKey = this.identity.getPrivateKey()
        if (privateKey !== undefined && signatureType !== SignatureType.ERC_1271) {
            signature = await this.createSignatureInWorker(opts, signatureType, privateKey)
        } else {
            signature = await this.identity.createMessageSignature(createSignaturePayload(opts))
        }

        return new StreamMessage({
            ...opts,
            signature,
            signatureType
        })
    }

    private async createSignatureInWorker(
        opts: MarkRequired<Omit<StreamMessageOptions, 'signature' | 'signatureType'>, 'messageType'>,
        signatureType: SignatureType,
        privateKey: Uint8Array
    ): Promise<Uint8Array> {
        const result = await this.signingService.sign({
            payloadInput: opts,
            privateKey,
            signatureType
        })

        if (result.type === 'error') {
            throw new Error(`Signing failed: ${result.message}`)
        }

        return result.signature
    }
}

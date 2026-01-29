import { MarkRequired } from 'ts-essentials'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { Identity, IdentityInjectionToken } from '../identity/Identity'
import { StreamMessage, StreamMessageOptions } from '../protocol/StreamMessage'
import { createSignaturePayload } from './createSignaturePayload'
import { SignatureType } from '@streamr/trackerless-network'
import { Signing } from './Signing'
import { toSignaturePayloadData } from './signingUtils'
import { DestroySignal } from '../DestroySignal'

@scoped(Lifecycle.ContainerScoped)
export class MessageSigner {
    private readonly identity: Identity
    private signing: Signing | undefined

    constructor(
        @inject(IdentityInjectionToken) identity: Identity,
            destroySignal?: DestroySignal
    ) {
        this.identity = identity
        destroySignal?.onDestroy.listen(() => this.destroy())
    }

    private getSigning(): Signing {
        return this.signing ??= new Signing()
    }

    async createSignedMessage(
        opts: MarkRequired<Omit<StreamMessageOptions, 'signature' | 'signatureType'>, 'messageType'>,
        signatureType: SignatureType
    ): Promise<StreamMessage> {
        let signature: Uint8Array

        // Use worker-based signing if identity provides a private key and signature type supports it
        // ERC-1271 signatures require on-chain verification and must be handled by the identity directly
        const privateKeyPromise = this.identity.getPrivateKey()
        if (privateKeyPromise !== undefined && signatureType !== SignatureType.ERC_1271) {
            signature = await this.createSignatureInWorker(opts, signatureType, privateKeyPromise)
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
        privateKeyPromise: Promise<Uint8Array>
    ): Promise<Uint8Array> {
        const privateKey = await privateKeyPromise
        const payloadData = toSignaturePayloadData(opts)
        
        const result = await this.getSigning().createSignature({
            payloadData,
            privateKey,
            signatureType
        })

        if (result.type === 'error') {
            throw new Error(`Signing failed: ${result.message}`)
        }

        return result.signature
    }

    /**
     * Cleanup worker resources when the signer is no longer needed.
     */
    destroy(): void {
        if (this.signing) {
            this.signing.destroy()
            this.signing = undefined
        }
    }
}

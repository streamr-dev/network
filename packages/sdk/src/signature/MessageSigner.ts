import { MarkRequired } from 'ts-essentials'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { Identity, IdentityInjectionToken } from '../identity/Identity'
import { StreamMessage, StreamMessageOptions } from '../protocol/StreamMessage'
import { createSignaturePayload } from './createSignaturePayload'
import { SignatureType } from '@streamr/trackerless-network'

@scoped(Lifecycle.ContainerScoped)
export class MessageSigner {
    private readonly identity: Identity

    constructor(@inject(IdentityInjectionToken) identity: Identity) {
        this.identity = identity
    }

    async createSignedMessage(
        opts: MarkRequired<Omit<StreamMessageOptions, 'signature' | 'signatureType'>, 'messageType'>,
        signatureType: SignatureType
    ): Promise<StreamMessage> {
        const signature = await this.identity.createMessageSignature(createSignaturePayload(opts))
        return new StreamMessage({
            ...opts,
            signature,
            signatureType
        })
    }
}

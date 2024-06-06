import { inject, Lifecycle, scoped } from 'tsyringe'
import { MarkRequired } from 'ts-essentials'
import { SignatureType, StreamMessage, StreamMessageOptions } from '@streamr/protocol'
import { Authentication, AuthenticationInjectionToken } from '../Authentication'
import { createSignaturePayload } from './signature'

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
        const signature = await this.authentication.createMessageSignature(createSignaturePayload({
            messageId: opts.messageId,
            messageType: opts.messageType,
            content: opts.content,
            signatureType: signatureType,
            encryptionType: opts.encryptionType,
            prevMsgRef: opts.prevMsgRef ?? undefined,
            newGroupKey: opts.newGroupKey ?? undefined
        }))
        return new StreamMessage({
            ...opts,
            signature,
            signatureType,
            content: opts.content
        })
    }
}

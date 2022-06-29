/**
 * StreamMessage Signing in-place.
 */
import { inject, Lifecycle, scoped } from 'tsyringe'
import { StreamMessage, StreamMessageSigned, SignatureType } from 'streamr-client-protocol'
import { Authentication, AuthenticationInjectionToken } from '../Authentication'

@scoped(Lifecycle.ContainerScoped)
export class Signer {
    constructor(@inject(AuthenticationInjectionToken) private authentication: Authentication) {}

    async sign<T>(
        streamMessage: StreamMessage<T>,
        signatureType: SignatureType = SignatureType.ETH
    ): Promise<StreamMessageSigned<T>> {
        if (!streamMessage) {
            throw new Error('streamMessage required as part of the data to sign.')
        }

        if (StreamMessage.isSigned(streamMessage)) {
            // already signed
            return streamMessage
        }

        if (typeof streamMessage.getTimestamp !== 'function' || !streamMessage.getTimestamp()) {
            throw new Error('Timestamp is required as part of the data to sign.')
        }

        if (signatureType !== SignatureType.ETH) {
            throw new Error(`Unrecognized signature type: ${signatureType}`)
        }

        const signedMessage: StreamMessageSigned<T> = Object.assign(streamMessage, {
            signatureType,
            signature: await this.authentication.createMessagePayloadSignature(streamMessage.getPayloadToSign(signatureType)),
        })

        return signedMessage
    }
}

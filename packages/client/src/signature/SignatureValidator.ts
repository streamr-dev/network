import { Lifecycle, scoped } from 'tsyringe'
import { SignatureType, StreamMessage, StreamMessageError } from '@streamr/protocol'
import { ERC1271ContractFacade } from '../contracts/ERC1271ContractFacade'
import { verifySignature } from '@streamr/utils'
import { createSignaturePayload } from './createSignaturePayload'
import { createLegacySignaturePayload } from './createLegacySignaturePayload'

type ValidatorFn = (streamMessage: StreamMessage) => Promise<boolean>

@scoped(Lifecycle.ContainerScoped)
export class SignatureValidator {
    private readonly validators = new Map<SignatureType, ValidatorFn>()

    constructor(erc1271ContractFacade: ERC1271ContractFacade) {
        this.validators.set(SignatureType.LEGACY_SECP256K1, async (streamMessage) => {
            const payload = createLegacySignaturePayload(streamMessage)
            return verifySignature(streamMessage.getPublisherId(), payload, streamMessage.signature)
        })
        this.validators.set(SignatureType.SECP256K1, async (streamMessage) => {
            const payload = createSignaturePayload(streamMessage)
            return verifySignature(streamMessage.getPublisherId(), payload, streamMessage.signature)
        })
        this.validators.set(SignatureType.ERC_1271, async (streamMessage) => {
            const payload = createSignaturePayload(streamMessage)
            return erc1271ContractFacade.isValidSignature(
                streamMessage.getPublisherId(),
                payload,
                streamMessage.signature
            )
        })
    }

    /**
     * Checks that the signature in the given StreamMessage is cryptographically valid.
     * Resolves if valid, rejects otherwise.
     */
    async assertSignatureIsValid(streamMessage: StreamMessage): Promise<void> {
        const validate = this.validators.get(streamMessage.signatureType)
        if (validate === undefined) {
            throw new Error(`Cannot validate message signature, unsupported signatureType: "${streamMessage.signatureType}"`)
        }
        let success: boolean
        try {
            success = await validate(streamMessage)
        } catch (err) {
            throw new StreamMessageError(`An error occurred during address recovery from signature: ${err}`, streamMessage)
        }
        if (!success) {
            throw new StreamMessageError('Signature validation failed', streamMessage)
        }
    }
}

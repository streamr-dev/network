import { toEthereumAddress } from '@streamr/utils'
import { Lifecycle, scoped } from 'tsyringe'
import { ERC1271ContractFacade } from '../contracts/ERC1271ContractFacade'
import { DestroySignal } from '../DestroySignal'
import { StreamMessage } from '../protocol/StreamMessage'
import { StreamrClientError } from '../StreamrClientError'
import { createSignaturePayload } from './createSignaturePayload'
import { SignatureValidation } from './SignatureValidationClient'
import { SignatureType } from '@streamr/trackerless-network'

@scoped(Lifecycle.ContainerScoped)
export class SignatureValidator {
    private readonly erc1271ContractFacade: ERC1271ContractFacade
    private signatureValidation: SignatureValidation | undefined

    constructor(
        erc1271ContractFacade: ERC1271ContractFacade,
        destroySignal: DestroySignal
    ) {
        this.erc1271ContractFacade = erc1271ContractFacade
        destroySignal.onDestroy.listen(() => this.destroy())
    }

    private getSignatureValidation(): SignatureValidation {
        return this.signatureValidation ??= new SignatureValidation()
    }

    /**
     * Checks that the signature in the given StreamMessage is cryptographically valid.
     * Resolves if valid, rejects otherwise.
     */
    async assertSignatureIsValid(streamMessage: StreamMessage): Promise<void> {
        let success: boolean
        try {
            success = await this.validate(streamMessage)
        } catch (err) {
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            throw new StreamrClientError(`An error occurred during address recovery from signature: ${err}`, 'INVALID_SIGNATURE', streamMessage)
        }
        if (!success) {
            throw new StreamrClientError('Signature validation failed', 'INVALID_SIGNATURE', streamMessage)
        }
    }

    private async validate(streamMessage: StreamMessage): Promise<boolean> {
        if (streamMessage.signatureType === SignatureType.ERC_1271) {
            return this.erc1271ContractFacade.isValidSignature(
                toEthereumAddress(streamMessage.messageId.publisherId),
                createSignaturePayload(streamMessage),
                streamMessage.signature
            )
        }
        const result = await this.getSignatureValidation().validateSignature(streamMessage)
        switch (result.type) {
            case 'valid':
                return true
            case 'invalid':
                return false
            case 'error':
                throw new Error(result.message)
            default:
                throw new Error(`Unknown signature validation result type '${result}'`)
        }
    }

    /**
     * Cleanup worker resources when the validator is no longer needed.
     */
    destroy(): void {
        if (this.signatureValidation) {
            this.signatureValidation.destroy()
            this.signatureValidation = undefined
        }
    }
}

import { Lifecycle, scoped } from 'tsyringe'
import { SignatureType, StreamMessage, StreamMessageError } from '@streamr/protocol'
import { ERC1271ContractFacade } from '../contracts/ERC1271ContractFacade'
import { ERC1271Validator } from './ERC1271Algorithms'
import { SECP256K1Validator } from './SECP256K1Algorithms'
import { LegacySECP256K1Validator } from './legacySECP256K1Algorithms'

export interface SignatureValidatorAlgorithm {
    assertSignatureIsValid(streamMessage: StreamMessage): Promise<boolean>
}

@scoped(Lifecycle.ContainerScoped)
export class SignatureValidator {
    private readonly validatorAlgorithms = new Map<SignatureType, SignatureValidatorAlgorithm>()

    constructor(erc1271ContractFacade: ERC1271ContractFacade) {
        this.validatorAlgorithms.set(SignatureType.LEGACY_SECP256K1, new LegacySECP256K1Validator())
        this.validatorAlgorithms.set(SignatureType.SECP256K1, new SECP256K1Validator())
        this.validatorAlgorithms.set(SignatureType.ERC_1271, new ERC1271Validator(erc1271ContractFacade))
    }

    /**
     * Checks that the signature in the given StreamMessage is cryptographically valid.
     * Resolves if valid, rejects otherwise.
     */
    async assertSignatureIsValid(streamMessage: StreamMessage): Promise<void> {
        const validatorAlgorithm = this.validatorAlgorithms.get(streamMessage.signatureType)
        if (validatorAlgorithm === undefined) {
            throw new Error(`Unsupported SignatureType: ${SignatureType}`)
        }
        let success: boolean
        try {
            success = await validatorAlgorithm.assertSignatureIsValid(streamMessage)
        } catch (err) {
            throw new StreamMessageError(`An error occurred during address recovery from signature: ${err}`, streamMessage)
        }
        if (!success) {
            throw new StreamMessageError('Signature validation failed', streamMessage)
        }
    }
}

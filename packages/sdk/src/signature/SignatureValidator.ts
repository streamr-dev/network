import { toEthereumAddress, toUserIdRaw, ECDSA_SECP256K1_EVM, SigningUtil } from '@streamr/utils'
import { Lifecycle, scoped } from 'tsyringe'
import { ERC1271ContractFacade } from '../contracts/ERC1271ContractFacade'
import { StreamMessage } from '../protocol/StreamMessage'
import { StreamrClientError } from '../StreamrClientError'
import { createLegacySignaturePayload } from './createLegacySignaturePayload'
import { createSignaturePayload } from './createSignaturePayload'
import { SignatureType } from '@streamr/trackerless-network'
import { IdentityMapping } from '../identity/IdentityMapping'

// Lookup structure SignatureType -> SigningUtil
const signingUtilBySignatureType: Record<number, SigningUtil> = Object.fromEntries(
    Object.values(IdentityMapping).map((config) => [config.signatureType, config.signingUtil])
)

@scoped(Lifecycle.ContainerScoped)
export class SignatureValidator {
    private readonly erc1271ContractFacade: ERC1271ContractFacade

    constructor(erc1271ContractFacade: ERC1271ContractFacade) {
        this.erc1271ContractFacade = erc1271ContractFacade
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
        const signingUtil = signingUtilBySignatureType[streamMessage.signatureType]

        // Common case
        if (signingUtil) {
            return signingUtil.verifySignature(
                toUserIdRaw(streamMessage.getPublisherId()),
                createSignaturePayload(streamMessage),
                streamMessage.signature
            )
        }

        // Special handling: different payload computation, same SigningUtil
        if (streamMessage.signatureType === SignatureType.ECDSA_SECP256K1_LEGACY) {
            return ECDSA_SECP256K1_EVM.verifySignature(
                // publisherId is hex encoded Ethereum address string
                toUserIdRaw(streamMessage.getPublisherId()),
                createLegacySignaturePayload(streamMessage),
                streamMessage.signature
            )
        }

        // Special handling: check signature with ERC-1271 contract facade
        if (streamMessage.signatureType === SignatureType.ERC_1271) {
            return this.erc1271ContractFacade.isValidSignature(
                toEthereumAddress(streamMessage.getPublisherId()),
                createSignaturePayload(streamMessage),
                streamMessage.signature
            )
        }

        throw new Error(`Cannot validate message signature, unsupported signatureType: "${streamMessage.signatureType}"`)
    }
}

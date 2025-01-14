import { toEthereumAddress, toUserIdRaw, verifySignature } from '@streamr/utils'
import { Lifecycle, scoped } from 'tsyringe'
import { ERC1271ContractFacade } from '../contracts/ERC1271ContractFacade'
import { SignatureType, StreamMessage } from '../protocol/StreamMessage'
import { StreamrClientError } from '../StreamrClientError'
import { createLegacySignaturePayload } from './createLegacySignaturePayload'
import { createSignaturePayload } from './createSignaturePayload'

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
            throw new StreamrClientError(
                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                `An error occurred during address recovery from signature: ${err}`,
                'INVALID_SIGNATURE',
                streamMessage
            )
        }
        if (!success) {
            throw new StreamrClientError('Signature validation failed', 'INVALID_SIGNATURE', streamMessage)
        }
    }

    private async validate(streamMessage: StreamMessage): Promise<boolean> {
        switch (streamMessage.signatureType) {
            case SignatureType.LEGACY_SECP256K1:
                return verifySignature(
                    toUserIdRaw(streamMessage.getPublisherId()),
                    createLegacySignaturePayload(streamMessage),
                    streamMessage.signature
                )
            case SignatureType.SECP256K1:
                return verifySignature(
                    toUserIdRaw(streamMessage.getPublisherId()),
                    createSignaturePayload(streamMessage),
                    streamMessage.signature
                )
            case SignatureType.ERC_1271:
                return this.erc1271ContractFacade.isValidSignature(
                    toEthereumAddress(streamMessage.getPublisherId()),
                    createSignaturePayload(streamMessage),
                    streamMessage.signature
                )
            default:
                throw new Error(
                    `Cannot validate message signature, unsupported signatureType: "${streamMessage.signatureType}"`
                )
        }
    }
}

import { verifySignature, hexToBinary } from '@streamr/utils'
import { Lifecycle, scoped } from 'tsyringe'
import { ERC1271ContractFacade } from '../contracts/ERC1271ContractFacade'
import { SignatureType, StreamMessage } from '../protocol/StreamMessage'
import { StreamMessageError } from '../protocol/StreamMessageError'
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
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            throw new StreamMessageError(`An error occurred during address recovery from signature: ${err}`, streamMessage)
        }
        if (!success) {
            throw new StreamMessageError('Signature validation failed', streamMessage)
        }
    }

    private async validate(streamMessage: StreamMessage): Promise<boolean> {
        switch (streamMessage.signatureType) {
            case SignatureType.LEGACY_SECP256K1:
                return verifySignature(
                    hexToBinary(streamMessage.getPublisherId()),
                    createLegacySignaturePayload(streamMessage),
                    streamMessage.signature
                )
            case SignatureType.SECP256K1:
                return verifySignature(
                    hexToBinary(streamMessage.getPublisherId()),
                    createSignaturePayload(streamMessage),
                    streamMessage.signature
                )
            case SignatureType.ERC_1271:
                return this.erc1271ContractFacade.isValidSignature(
                    streamMessage.getPublisherId(),
                    createSignaturePayload(streamMessage),
                    streamMessage.signature
                )
            default:
                throw new Error(`Cannot validate message signature, unsupported signatureType: "${streamMessage.signatureType}"`)
        }
    }
}

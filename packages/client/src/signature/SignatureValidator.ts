import { Lifecycle, scoped } from 'tsyringe'
import { SignatureType, StreamMessage, StreamMessageError } from '@streamr/protocol'
import { createSignaturePayload } from './signature'
import { verifySignature } from '@streamr/utils'
import { ERC1271ContractFacade } from '../contracts/ERC1271ContractFacade'

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
        const payload = createSignaturePayload({
            messageId: streamMessage.messageId,
            messageType: streamMessage.messageType,
            content: streamMessage.content,
            signatureType: streamMessage.signatureType,
            encryptionType: streamMessage.encryptionType,
            prevMsgRef: streamMessage.prevMsgRef ?? undefined,
            newGroupKey: streamMessage.newGroupKey ?? undefined
        })
        let success: boolean
        try {
            if (streamMessage.signatureType !== SignatureType.ERC_1271) {
                success = verifySignature(streamMessage.getPublisherId(), payload, streamMessage.signature)
            } else {
                success = await this.erc1271ContractFacade.isValidSignature(
                    streamMessage.getPublisherId(),
                    payload,
                    streamMessage.signature
                )
            }
        } catch (err) {
            throw new StreamMessageError(`An error occurred during address recovery from signature: ${err}`, streamMessage)
        }
        if (!success) {
            throw new StreamMessageError('Signature validation failed', streamMessage)
        }
    }
}

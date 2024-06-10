import { SignatureValidatorAlgorithm } from './SignatureValidator'
import { StreamMessage } from '@streamr/protocol'
import { createSignaturePayload } from './createSignaturePayload'
import { ERC1271ContractFacade } from '../contracts/ERC1271ContractFacade'

export class ERC1271Validator implements SignatureValidatorAlgorithm {

    private readonly erc1271ContractFacade: ERC1271ContractFacade

    constructor(erc1271ContractFacade: ERC1271ContractFacade) {
        this.erc1271ContractFacade = erc1271ContractFacade
    }

    async assertSignatureIsValid(streamMessage: StreamMessage): Promise<boolean> {
        const payload = createSignaturePayload(streamMessage)
        return this.erc1271ContractFacade.isValidSignature(
            streamMessage.getPublisherId(),
            payload,
            streamMessage.signature
        )
    }
}

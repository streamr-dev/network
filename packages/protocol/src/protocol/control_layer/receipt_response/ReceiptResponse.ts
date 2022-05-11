import {
    validateIsNotEmptyString,
    validateIsNotNullOrUndefined
} from '../../../utils/validations'
import ControlMessage, { ControlMessageOptions } from '../ControlMessage'
import { Claim } from '../receipt_request/ReceiptRequest'

export interface Options extends ControlMessageOptions {
    claim: Claim
    signature?: string | null
    errorMessage?: string | null
}

export default class ReceiptResponse extends ControlMessage {
    readonly claim: Claim
    readonly signature: string | null
    readonly errorMessage: string | null

    constructor({
        version = ControlMessage.LATEST_VERSION,
        requestId,
        claim,
        signature = null,
        errorMessage = null
    }: Options) {
        super(version, ControlMessage.TYPES.ReceiptResponse, requestId)

        validateIsNotNullOrUndefined('claim', claim)
        validateIsNotEmptyString('signature', signature)
        validateIsNotEmptyString('errorMessage', errorMessage, true)

        this.claim = claim
        this.signature = signature
        this.errorMessage = errorMessage
    }
}

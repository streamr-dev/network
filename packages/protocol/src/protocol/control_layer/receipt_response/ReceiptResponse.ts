import {
    validateIsNotEmptyString,
    validateIsNotNullOrUndefined,
    validateIsOneOf
} from '../../../utils/validations'
import ControlMessage, { ControlMessageOptions } from '../ControlMessage'
import { Claim } from '../receipt_request/ReceiptRequest'

export interface Options extends ControlMessageOptions {
    claim: Claim
    signature?: string | null
    refusalCode?: RefusalCode | null
}

export enum RefusalCode {
    SENDER_IDENTITY_MISMATCH = 'SENDER_IDENTITY_MISMATCH', // TODO: should even send?
    INVALID_SIGNATURE = 'INVALID_SIGNATURE',
    BUCKET_NOT_FOUND = 'BUCKET_NOT_FOUND', // TODO: this is sort of like the below?
    DISAGREEMENT = 'DISAGREEMENT',
}

export default class ReceiptResponse extends ControlMessage {
    readonly claim: Claim
    readonly signature: string | null
    readonly refusalCode: RefusalCode | null

    constructor({
        version = ControlMessage.LATEST_VERSION,
        requestId,
        claim,
        signature = null,
        refusalCode = null
    }: Options) {
        super(version, ControlMessage.TYPES.ReceiptResponse, requestId)

        validateIsNotNullOrUndefined('claim', claim)
        validateIsNotEmptyString('signature', signature, true)
        validateIsNotEmptyString('refusalCode', refusalCode, true)
        validateIsOneOf('refusalCode', refusalCode, Object.values(RefusalCode), true)

        this.claim = claim
        this.signature = signature
        this.refusalCode = refusalCode
    }
}

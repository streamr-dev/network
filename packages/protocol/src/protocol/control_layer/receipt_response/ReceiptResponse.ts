import {
    validateIsNotEmptyString,
    validateIsOneOf
} from '../../../utils/validations'
import ControlMessage, { ControlMessageOptions } from '../ControlMessage'
import { Claim } from '../receipt_request/ReceiptRequest'

export interface Options extends ControlMessageOptions {
    receipt?: Receipt | null
    refusalCode?: RefusalCode | null
}

export enum RefusalCode {
    SENDER_IDENTITY_MISMATCH = 'SENDER_IDENTITY_MISMATCH', // TODO: should even send?
    INVALID_SIGNATURE = 'INVALID_SIGNATURE',
    BUCKET_NOT_FOUND = 'BUCKET_NOT_FOUND', // TODO: this is sort of like the below?
    DISAGREEMENT = 'DISAGREEMENT',
}

export interface Receipt {
    claim: Claim
    signature: string
}

export default class ReceiptResponse extends ControlMessage {
    readonly receipt: Receipt | null
    readonly refusalCode: RefusalCode | null

    constructor({
        version = ControlMessage.LATEST_VERSION,
        requestId,
        receipt = null,
        refusalCode = null
    }: Options) {
        super(version, ControlMessage.TYPES.ReceiptResponse, requestId)
        validateIsNotEmptyString('refusalCode', refusalCode, true)
        validateIsOneOf('refusalCode', refusalCode, Object.values(RefusalCode), true)

        this.receipt = receipt
        this.refusalCode = refusalCode
    }
}

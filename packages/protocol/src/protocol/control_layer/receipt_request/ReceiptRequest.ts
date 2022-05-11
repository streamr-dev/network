import {
    validateIsNotEmptyString,
    validateIsNotNullOrUndefined
} from '../../../utils/validations'
import ControlMessage, { ControlMessageOptions } from '../ControlMessage'
import { StreamID } from '../../../utils/StreamID'
import { EthereumAddress} from "../../../utils"

export interface Claim {
    streamId: StreamID
    streamPartition: number
    publisherId: string
    msgChainId: string
    windowNumber: number
    messageCount: number
    totalPayloadSize: number
    sender: EthereumAddress
    receiver: EthereumAddress
}

export interface Options extends ControlMessageOptions {
    claim: Claim
    signature: string
}

export default class ReceiptRequest extends ControlMessage {
    readonly claim: Claim
    readonly signature: string

    constructor({ version = ControlMessage.LATEST_VERSION, requestId, claim, signature }: Options) {
        super(version, ControlMessage.TYPES.ReceiptRequest, requestId)

        validateIsNotNullOrUndefined('claim', claim)
        validateIsNotEmptyString('signature', signature)

        this.claim = claim
        this.signature = signature
    }
}

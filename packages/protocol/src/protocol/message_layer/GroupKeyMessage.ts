import { validateIsString } from '../../utils/validations'
import StreamMessage, { StreamMessageType } from './StreamMessage'
import { EthereumAddress } from '@streamr/utils'

export default abstract class GroupKeyMessage {
    recipient: EthereumAddress
    messageType: StreamMessageType

    protected constructor(recipient: EthereumAddress, messageType: StreamMessageType) {
        validateIsString('recipient', recipient)
        StreamMessage.validateMessageType(messageType)
        this.recipient = recipient
        this.messageType = messageType
    }
}

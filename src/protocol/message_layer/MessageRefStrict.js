import { validateIsNotNegativeInteger } from '../../utils/validations'
import MessageRef from './MessageRef'

/**
 * Strict messageRef that requires sequenceNumber to be set
 */
export default class MessageRefStrict extends MessageRef {
    constructor(timestamp, sequenceNumber) {
        super(timestamp, sequenceNumber)
        validateIsNotNegativeInteger('sequenceNumber', sequenceNumber)
    }
}

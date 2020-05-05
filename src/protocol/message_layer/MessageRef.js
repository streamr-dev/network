import { validateIsNotNegativeInteger } from '../../utils/validations'

export default class MessageRef {
    constructor(timestamp, sequenceNumber) {
        validateIsNotNegativeInteger('timestamp', timestamp)
        validateIsNotNegativeInteger('sequenceNumber', sequenceNumber, true)
        this.timestamp = timestamp
        this.sequenceNumber = sequenceNumber
    }

    compareTo(other) {
        if (this.timestamp < other.timestamp) {
            return -1
        }
        if (this.timestamp > other.timestamp) {
            return 1
        }
        if (this.sequenceNumber < other.sequenceNumber) {
            return -1
        }
        if (this.sequenceNumber > other.sequenceNumber) {
            return 1
        }
        return 0
    }

    toArray() {
        return [
            this.timestamp,
            this.sequenceNumber,
        ]
    }

    serialize() {
        return JSON.stringify(this.toArray())
    }
}

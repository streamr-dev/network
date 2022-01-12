import { validateIsNotNegativeInteger } from '../../utils/validations'

export default class MessageRef {

    timestamp: number
    sequenceNumber: number

    constructor(timestamp: number, sequenceNumber: number) {
        validateIsNotNegativeInteger('timestamp', timestamp)
        validateIsNotNegativeInteger('sequenceNumber', sequenceNumber, true)
        this.timestamp = timestamp
        this.sequenceNumber = sequenceNumber
    }

    compareTo(other: MessageRef): number {
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

    toArray(): any[] {
        return [
            this.timestamp,
            this.sequenceNumber,
        ]
    }

    static fromArray(arr: any[]): MessageRef {
        const [
            timestamp,
            sequenceNumber,
        ] = arr
        return new MessageRef(timestamp, sequenceNumber)
    }

    serialize(): string {
        return JSON.stringify(this.toArray())
    }

    clone(): MessageRef {
        return new MessageRef(this.timestamp, this.sequenceNumber)
    }
}

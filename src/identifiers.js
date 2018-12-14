/**
 * Uniquely identifies a stream
 */
class StreamID {
    constructor(id, partition) {
        if (typeof id !== 'string') {
            throw new Error(`invalid id: ${id}`)
        }
        if (!Number.isInteger(partition)) {
            throw new Error(`invalid partition: ${partition}`)
        }
        this.id = id
        this.partition = partition
    }

    key() {
        return this.toString()
    }

    toString() {
        return `${this.id}::${this.partition}`
    }

    static fromObject({ id, partition }) {
        return new StreamID(id, partition)
    }
}

/**
 * Tuple (streamId, timestamp, sequenceNo, publisherId) provides unique
 * identity and ordering for messages.
 */
class MessageID {
    constructor(streamId, timestamp, sequenceNo, publisherId) {
        if (!(streamId instanceof StreamID)) {
            throw new Error(`invalid streamId: ${streamId}`)
        }
        if (!Number.isInteger(timestamp)) {
            throw new Error(`invalid timestamp: ${timestamp}`)
        }
        if (!Number.isInteger(sequenceNo)) {
            throw new Error(`invalid sequenceNo: ${sequenceNo}`)
        }
        if (typeof publisherId !== 'string') {
            throw new Error(`invalid publisherId: ${publisherId}`)
        }

        this.streamId = streamId
        this.timestamp = timestamp
        this.sequenceNo = sequenceNo
        this.publisherId = publisherId
    }

    toString() {
        return `(${this.streamId}, ${this.timestamp}, ${this.sequenceNo}, ${this.publisherId})`
    }

    static fromObject({ streamId, timestamp, sequenceNo, publisherId }) {
        return new MessageID(StreamID.fromObject(streamId), timestamp, sequenceNo, publisherId)
    }
}

/**
 * MessageReference is used to refer to a previous message in a stream. Only a
 * subset of the MessageID fields are needed because the rest are already known
 * and readily available in MessageID.
 */
class MessageReference {
    constructor(timestamp, sequenceNo) {
        if (!Number.isInteger(timestamp)) {
            throw new Error(`invalid timestamp: ${timestamp}`)
        }
        if (!Number.isInteger(sequenceNo)) {
            throw new Error(`invalid sequenceNo: ${sequenceNo}`)
        }

        this.timestamp = timestamp
        this.sequenceNo = sequenceNo
    }

    toString() {
        return `(${this.timestamp}, ${this.sequenceNo})`
    }

    static fromObject({ timestamp, sequenceNo }) {
        return new MessageReference(timestamp, sequenceNo)
    }
}

module.exports = {
    StreamID,
    MessageID,
    MessageReference,
}

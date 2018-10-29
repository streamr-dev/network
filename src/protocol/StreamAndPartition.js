import ParseUtil from '../utils/ParseUtil'
import ValidationError from '../errors/ValidationError'

class StreamAndPartition {
    constructor(streamId, streamPartition = 0) {
        if (!streamId) {
            throw new ValidationError('Stream ID not given!')
        }
        if (!streamPartition == null) {
            throw new ValidationError('Stream partition not given!')
        }

        this.streamId = streamId
        this.streamPartition = streamPartition
    }

    toObject() {
        return {
            stream: this.streamId,
            partition: this.streamPartition,
        }
    }

    serialize() {
        return JSON.stringify(this.toObject())
    }

    static objectToConstructorArgs(msg) {
        return [msg.stream, msg.partition]
    }

    static deserialize(stringOrObject) {
        const msg = ParseUtil.ensureParsed(stringOrObject)

        // calling this.prototype.constructor instead of new StreamAndPartition(...) works for subclasses too
        return new this.prototype.constructor(...this.objectToConstructorArgs(msg))
    }
}

module.exports = StreamAndPartition

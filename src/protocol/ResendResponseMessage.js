import StreamAndPartition from './StreamAndPartition'

module.exports = class ResendResponseMessage extends StreamAndPartition {
    constructor(streamId, streamPartition, subId) {
        super(streamId, streamPartition)
        if (subId == null) {
            throw new Error('Subscription id cannot be null!')
        }
        this.subId = subId
    }

    toObject() {
        return {
            ...super.toObject(),
            sub: this.subId,
        }
    }

    static objectToConstructorArgs(msg) {
        return [msg.stream, msg.partition, msg.sub]
    }
}

export default class StreamPart {
    constructor(streamId, streamPartition) {
        this._streamId = streamId
        this._streamPartition = streamPartition
    }

    static fromStream({ id, partitions }) {
        const result = []
        for (let i = 0; i < partitions; i++) {
            result.push(new StreamPart(id, i))
        }
        return result
    }

    getStreamId() {
        return this._streamId
    }

    getStreamPartition() {
        return this._streamPartition
    }
}

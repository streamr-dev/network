export class StreamPart {

    _streamId: string
    _streamPartition: number

    constructor(streamId: string, streamPartition: number) {
        this._streamId = streamId
        this._streamPartition = streamPartition
    }

    static fromStream({ id, partitions }: { id: string, partitions: number }) {
        const result: StreamPart[] = []
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

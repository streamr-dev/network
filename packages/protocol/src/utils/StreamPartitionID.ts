import { StreamID, StreamIDUtils } from "./StreamID"
import LRUCache = require("lru-cache")

const DELIMITER = '#'

export type StreamPartitionID = string & { readonly __brand: 'streamPartitionID' } // Nominal typing

const pairCache = new LRUCache<StreamPartitionID, [StreamID, number]>(1000)

function ensureValidPartition(partition: number): void | never {
    if (Number.isNaN(partition) || partition < 0 || partition > 100) {
        throw new Error(`invalid partition value: ${partition}`)
    }
}

function getParts(str: string): [string, number] {
    const lastIdx = str.lastIndexOf(DELIMITER)
    if (lastIdx === -1 || lastIdx === str.length - 1) {
        throw new Error(`not valid streamPartitionID string: ${str}`)
    }
    return [str.substring(0, lastIdx), parseInt(str.substring(lastIdx + 1))]
}

export class StreamPartitionIDUtils {
    static toStreamPartitionID(streamId: StreamID, partition: number): StreamPartitionID | never {
        ensureValidPartition(partition)
        return `${streamId}${DELIMITER}${partition}` as StreamPartitionID
    }

    static parse(streamPartitionIdAsStr: string): StreamPartitionID | never {
        const [streamId, partition] = getParts(streamPartitionIdAsStr)
        StreamIDUtils.toStreamID(streamId)
        ensureValidPartition(partition)
        return streamPartitionIdAsStr as StreamPartitionID
    }

    static getStreamID(streamPartitionId: StreamPartitionID): StreamID {
        return this.getStreamIDAndPartition(streamPartitionId)[0]
    }

    static getPartition(streamPartitionId: StreamPartitionID): number {
        return this.getStreamIDAndPartition(streamPartitionId)[1]
    }

    static getStreamIDAndPartition(streamPartitionId: StreamPartitionID): [StreamID, number] {
        let pair = pairCache.get(streamPartitionId)
        if (pair === undefined) {
            pair = getParts(streamPartitionId) as [StreamID, number]
            pairCache.set(streamPartitionId, pair)
        }
        return pair
    }
}

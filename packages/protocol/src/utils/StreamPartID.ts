import { StreamID, StreamIDUtils } from "./StreamID"
import LRUCache = require("lru-cache")

const DELIMITER = '#'

export type StreamPartID = string & { readonly __brand: 'streamPartID' } // Nominal typing

const pairCache = new LRUCache<StreamPartID, [StreamID, number]>(1000)

function ensureValidStreamPartition(streamPartition: number): void | never {
    if (!Number.isSafeInteger(streamPartition) || streamPartition < 0 || streamPartition > 100) {
        throw new Error(`invalid streamPartition value: ${streamPartition}`)
    }
}

function parseElements(str: string): [string, number] {
    const lastIdx = str.lastIndexOf(DELIMITER)
    if (lastIdx === -1 || lastIdx === str.length - 1) {
        throw new Error(`not valid streamPartID string: ${str}`)
    }
    return [str.substring(0, lastIdx), parseInt(str.substring(lastIdx + 1))]
}

export class StreamPartIDUtils {
    static toStreamPartID(streamId: StreamID, streamPartition: number): StreamPartID | never {
        ensureValidStreamPartition(streamPartition)
        return `${streamId}${DELIMITER}${streamPartition}` as StreamPartID
    }

    static parse(streamPartIdAsStr: string): StreamPartID | never {
        const [streamId, streamPartition] = parseElements(streamPartIdAsStr)
        StreamIDUtils.toStreamID(streamId) // throws if not valid
        ensureValidStreamPartition(streamPartition)
        return streamPartIdAsStr as StreamPartID
    }

    static getStreamID(streamPartId: StreamPartID): StreamID {
        return this.getStreamIDAndStreamPartition(streamPartId)[0]
    }

    static getStreamPartition(streamPartId: StreamPartID): number {
        return this.getStreamIDAndStreamPartition(streamPartId)[1]
    }

    static getStreamIDAndStreamPartition(streamPartId: StreamPartID): [StreamID, number] {
        let pair = pairCache.get(streamPartId)
        if (pair === undefined) {
            pair = getParts(streamPartId) as [StreamID, number]
            pairCache.set(streamPartId, pair)
        }
        return pair
    }
}

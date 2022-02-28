import { StreamID, toStreamID } from "./StreamID"

const DELIMITER = '#'
export const MAX_PARTITION_COUNT = 100

export type StreamPartID = string & { readonly __brand: 'streamPartID' } // Nominal typing

function ensureValidStreamPartition(streamPartition: number): void | never {
    if (!Number.isSafeInteger(streamPartition) || streamPartition < 0 || streamPartition >= MAX_PARTITION_COUNT) {
        throw new Error(`invalid streamPartition value: ${streamPartition}`)
    }
}

export function toStreamPartID(streamId: StreamID, streamPartition: number): StreamPartID | never {
    ensureValidStreamPartition(streamPartition)
    return `${streamId}${DELIMITER}${streamPartition}` as StreamPartID
}

export class StreamPartIDUtils {
    static parse(streamPartIdAsStr: string): StreamPartID | never {
        const [streamId, streamPartition] = StreamPartIDUtils.parseRawElements(streamPartIdAsStr)
        if (streamPartition === undefined) {
            throw new Error(`invalid streamPartID string: ${streamPartIdAsStr}`)
        }
        toStreamID(streamId) // throws if not valid
        ensureValidStreamPartition(streamPartition)
        return streamPartIdAsStr as StreamPartID
    }

    static getStreamID(streamPartId: StreamPartID): StreamID {
        return this.getStreamIDAndPartition(streamPartId)[0]
    }

    static getStreamPartition(streamPartId: StreamPartID): number {
        return this.getStreamIDAndPartition(streamPartId)[1]
    }

    static getStreamIDAndPartition(streamPartId: StreamPartID): [StreamID, number] {
        return StreamPartIDUtils.parseRawElements(streamPartId) as [StreamID, number]
    }

    static parseRawElements(str: string): [string, number | undefined] {
        const lastIdx = str.lastIndexOf(DELIMITER)
        if (lastIdx === -1 || lastIdx === str.length - 1) {
            return [str, undefined]
        }
        return [str.substring(0, lastIdx), Number(str.substring(lastIdx + 1))]
    }
}

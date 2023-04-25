import { StreamID, toStreamID } from "./StreamID"
import { BrandedString } from '@streamr/utils'
import { ensureValidStreamPartitionIndex } from './partition'

const DELIMITER = '#'

export type StreamPartID = BrandedString<'StreamPartID'>

export function toStreamPartID(streamId: StreamID, streamPartition: number): StreamPartID | never {
    ensureValidStreamPartitionIndex(streamPartition)
    return `${streamId}${DELIMITER}${streamPartition}` as StreamPartID
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class StreamPartIDUtils {
    static parse(streamPartIdAsStr: string): StreamPartID | never {
        const [streamId, streamPartition] = StreamPartIDUtils.parseRawElements(streamPartIdAsStr)
        if (streamPartition === undefined) {
            throw new Error(`invalid streamPartID string: ${streamPartIdAsStr}`)
        }
        toStreamID(streamId) // throws if not valid
        ensureValidStreamPartitionIndex(streamPartition)
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

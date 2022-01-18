import { StreamID, StreamPartID, StreamPartIDUtils, toStreamID, toStreamPartID } from 'streamr-client-protocol'

const DEFAULT_PARTITION = 0

export type StreamDefinition = string
    | { id: string, partition?: number }
    | { stream: string, partition?: number }
    | { streamId: string, partition?: number }

function pickStreamId(definition: { id: string } | { stream: string } | { streamId: string }): StreamID {
    return toStreamID((definition as any).id ?? (definition as any).stream ?? (definition as any).streamId)
}

/* eslint-disable no-else-return */
export function matches(streamDefinition: StreamDefinition, streamPartId: StreamPartID): boolean {
    if (typeof streamDefinition === 'string') {
        return streamDefinition === StreamPartIDUtils.getStreamID(streamPartId)
    } else if (streamDefinition.partition === undefined) {
        return pickStreamId(streamDefinition) === StreamPartIDUtils.getStreamID(streamPartId)
    } else {
        return definitionToStreamPartID(streamDefinition) === streamPartId
    }
}

export function definitionToStreamPartElements(definition: StreamDefinition): [StreamID, number | undefined] {
    if (typeof definition === 'string') {
        if (definition.includes('#')) { // TODO: replace with constant from protocol / or isStreamPartID()
            return StreamPartIDUtils.getStreamIDAndStreamPartition(StreamPartIDUtils.parse(definition))
        } else {
            return [toStreamID(definition), undefined]
        }
    } else if (typeof definition === 'object') {
        return [pickStreamId(definition), definition.partition]
    } else {
        throw new Error('streamDefinition: must be of type string or object')
    }
}

export function definitionToStreamPartID(definition: StreamDefinition): StreamPartID | never {
    if (typeof definition === 'string') {
        if (definition.includes('#')) { // TODO: replace with constant from protocol / or isStreamPartID()
            return StreamPartIDUtils.parse(definition)
        } else {
            return toStreamPartID(toStreamID(definition), DEFAULT_PARTITION) // streamIdBuilder.toStreamID()
        }
    } else if (typeof definition === 'object') {
        return toStreamPartID(pickStreamId(definition), definition.partition ?? DEFAULT_PARTITION)
    } else {
        throw new Error('streamDefinition: must be of type string or object')
    }
}

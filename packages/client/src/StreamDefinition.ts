import { StreamPartID, StreamPartIDUtils, toStreamID, toStreamPartID } from 'streamr-client-protocol'

export type StreamDefinition = string
    | { id: string, partition?: number }
    | { stream: string, partition?: number }

const DEFAULT_PARTITION = 0

/* eslint-disable no-else-return */
export function definitionToStreamPartID(definition: StreamDefinition): StreamPartID {
    if (typeof definition === 'string') {
        if (definition.includes('#')) { // TODO: replace with constant from protocol / or isStreamPartID()
            return StreamPartIDUtils.parse(definition)
        } else {
            return toStreamPartID(toStreamID(definition), DEFAULT_PARTITION)
        }
    } else {
        const streamId = toStreamID((definition as any).id ?? (definition as any).stream)
        return toStreamPartID(streamId, DEFAULT_PARTITION)
    }
}

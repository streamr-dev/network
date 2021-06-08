import { inspect } from 'util'
import { Stream, StreamPartDefinition } from '../stream'

export type StreamIDish = Stream | StreamPartDefinition | string

export function getStreamId(streamObjectOrId: StreamIDish) {
    if (streamObjectOrId && typeof streamObjectOrId === 'string') {
        return streamObjectOrId
    }

    if (typeof streamObjectOrId === 'object') {
        if ('streamId' in streamObjectOrId && streamObjectOrId.streamId != null) {
            return streamObjectOrId.streamId
        }

        if ('id' in streamObjectOrId && streamObjectOrId.id != null) {
            return streamObjectOrId.id
        }
    }

    throw new Error(`First argument must be a Stream object or the stream id! Was: ${inspect(streamObjectOrId)}`)
}

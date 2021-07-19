import { inspect } from 'util'
import { SIDLike, SPID } from 'streamr-client-protocol'

export type StreamIDish = SIDLike

export function getStreamId(streamObjectOrId: StreamIDish) {
    const { streamId } = SPID.parse(streamObjectOrId)
    if (streamId != null) {
        return streamId
    }

    throw new Error(`First argument must be a Stream object or the stream id! Was: ${inspect(streamObjectOrId)}`)
}

export const getStreamPartition = (streamObjectOrId: StreamIDish): number|undefined => {
    if (typeof streamObjectOrId === 'object') {
        return (streamObjectOrId as any).streamPartition ?? (streamObjectOrId as any).partition ?? undefined
    }
    return undefined
}

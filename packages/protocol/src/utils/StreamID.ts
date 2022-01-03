export type StreamID = string & { readonly __brand: 'streamId' } // Nominal typing

export const KEY_EXCHANGE_STREAM_PREFIX = 'SYSTEM/keyexchange/'

export function formKeyExchangeStreamId(address: string): StreamID {
    return (KEY_EXCHANGE_STREAM_PREFIX + address.toLowerCase()) as StreamID
}

export function toStreamID(streamIdOrPathAsStr: string, baseAddress?: string): StreamID {
    if (streamIdOrPathAsStr.length === 0) {
        throw new Error('stream id may not be empty')
    }
    const firstSlashIdx = streamIdOrPathAsStr.indexOf('/')
    if (firstSlashIdx === -1) { // legacy format
        return streamIdOrPathAsStr as StreamID
    } else if (isKeyExchangeStream(streamIdOrPathAsStr)) { // key-exchange format
        return streamIdOrPathAsStr as StreamID
    } else if (firstSlashIdx === 0) { // path-only format
        if (baseAddress === undefined) {
            throw new Error(`path-only stream id (${streamIdOrPathAsStr}) provided without baseAddress`)
        }
        return (baseAddress.toLowerCase() + streamIdOrPathAsStr) as StreamID
    } else {
        const address = streamIdOrPathAsStr.substring(0, firstSlashIdx).toLowerCase()
        const path = streamIdOrPathAsStr.substring(firstSlashIdx)
        return (address + path) as StreamID
    }
}

export function isPathOnlyFormat(str: string): boolean {
    return str.startsWith('/')
}

export function isKeyExchangeStream(streamId: StreamID | string): boolean {
    return streamId.startsWith(KEY_EXCHANGE_STREAM_PREFIX)
}

export function getRecipient(streamId: StreamID): string | undefined {
    if (isKeyExchangeStream(streamId)) {
        return streamId.substring(KEY_EXCHANGE_STREAM_PREFIX.length)
    }
    return undefined
}

import { EthereumAddress } from './types'

export type StreamID = string & { readonly __brand: 'streamId' } // Nominal typing

export const KEY_EXCHANGE_STREAM_PREFIX = 'SYSTEM/keyexchange/'

export function formKeyExchangeStreamId(address: string): StreamID {
    return (KEY_EXCHANGE_STREAM_PREFIX + address.toLowerCase()) as StreamID
}

/**
 * TODO: show examples
 */
export function toStreamID(streamIdOrPath: string, baseAddress?: EthereumAddress): StreamID {
    if (streamIdOrPath.length === 0) {
        throw new Error('stream id may not be empty')
    }
    const firstSlashIdx = streamIdOrPath.indexOf('/')
    if (firstSlashIdx === -1) { // legacy format
        return streamIdOrPath as StreamID
    } else if (isKeyExchangeStream(streamIdOrPath)) { // key-exchange format
        return streamIdOrPath as StreamID
    } else if (firstSlashIdx === 0) { // path-only format
        if (baseAddress === undefined) {
            throw new Error(`path-only format (${streamIdOrPath}) provided without baseAddress`)
        }
        return (baseAddress.toLowerCase() + streamIdOrPath) as StreamID
    } else {
        const address = streamIdOrPath.substring(0, firstSlashIdx).toLowerCase()
        const path = streamIdOrPath.substring(firstSlashIdx)
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

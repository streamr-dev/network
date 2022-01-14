import { EthereumAddress } from './types'

export type StreamID = string & { readonly __brand: 'streamID' } // Nominal typing

/**
 * Create an instance of `StreamID` from a given string stream id or path.
 *
 * Supported formats:
 *  - full stream id format, e.g., '0x0000000000000000000000000000000000000000/foo/bar'
 *  - path-only format, e.g. , '/foo/bar'
 *  - key-exchange format, e.g., SYSTEM/keyexchange/0x0000000000000000000000000000000000000000
 *  - legacy format, e.g., '7wa7APtlTq6EC5iTCBy6dw'
 *
 *  If `streamIdOrPath` is not in path-only format, `address` can be left undefined.
 */
export function toStreamID(streamIdOrPath: string, address?: EthereumAddress): StreamID | never {
    if (streamIdOrPath.length === 0) {
        throw new Error('stream id may not be empty')
    }
    const firstSlashIdx = streamIdOrPath.indexOf('/')
    if (firstSlashIdx === -1) { // legacy format
        return streamIdOrPath as StreamID
    } else if (StreamIDUtils.isKeyExchangeStream(streamIdOrPath)) { // key-exchange format
        return streamIdOrPath as StreamID
    } else if (firstSlashIdx === 0) { // path-only format
        if (address === undefined) {
            throw new Error(`path-only format "${streamIdOrPath}" provided without address`)
        }
        return (address.toLowerCase() + streamIdOrPath) as StreamID
    } else {
        const address = streamIdOrPath.substring(0, firstSlashIdx).toLowerCase()
        const path = streamIdOrPath.substring(firstSlashIdx)
        return (address + path) as StreamID
    }
}

export class StreamIDUtils {

    static readonly KEY_EXCHANGE_STREAM_PREFIX = 'SYSTEM/keyexchange/'

    static formKeyExchangeStreamID(recipient: EthereumAddress): StreamID {
        return (StreamIDUtils.KEY_EXCHANGE_STREAM_PREFIX + recipient.toLowerCase()) as StreamID
    }
    
    static isPathOnlyFormat(streamIdOrPath: string): boolean {
        return streamIdOrPath.startsWith('/')
    }
    
    static isKeyExchangeStream(streamId: StreamID | string): boolean {
        return streamId.startsWith(StreamIDUtils.KEY_EXCHANGE_STREAM_PREFIX)
    }
    
    static getAddress(streamId: StreamID): string | undefined {
        const addressAndPath = StreamIDUtils.getAddressAndPath(streamId)
        return addressAndPath?.[0]
    }
    
    static getPath(streamId: StreamID): string | undefined {
        const addressAndPath = StreamIDUtils.getAddressAndPath(streamId)
        return addressAndPath?.[1]
    }
    
    static getAddressAndPath(streamId: StreamID): [string, string] | undefined {
        const firstSlashIdx = streamId.indexOf('/')
        if (firstSlashIdx !== -1 && !StreamIDUtils.isKeyExchangeStream(streamId)) {
            return [streamId.substring(0, firstSlashIdx), streamId.substring(firstSlashIdx)]
        } else {
            return undefined
        }
    }
    
    // TODO: if recipient exists, will it always be an EthereumAddress? Can it be an ENS domain?
    static getRecipient(streamId: StreamID): string | undefined {
        if (StreamIDUtils.isKeyExchangeStream(streamId)) {
            return streamId.substring(StreamIDUtils.KEY_EXCHANGE_STREAM_PREFIX.length)
        }
        return undefined
    }
    
}

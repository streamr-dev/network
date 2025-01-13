import { ENSName } from './ENSName'
import { EthereumAddress } from './EthereumAddress'
import { toEthereumAddressOrENSName } from './toEthereumAddressOrENSName'
import { BrandedString } from './types'

export type StreamID = BrandedString<'StreamID'>

/**
 * Create an instance of `StreamID` from a given string stream id or path.
 *
 * Supported formats:
 *  - full stream id format, e.g., '0x0000000000000000000000000000000000000000/foo/bar' or 'name.eth/foo/bar'
 *  - path-only format, e.g. , '/foo/bar'
 *  - legacy format, e.g., '7wa7APtlTq6EC5iTCBy6dw'
 *
 *  If `streamIdOrPath` is not in path-only format, `domain` can be left undefined.
 */
export function toStreamID(streamIdOrPath: string, domain?: EthereumAddress | ENSName): StreamID | never {
    if (streamIdOrPath.length === 0) {
        throw new Error('stream id may not be empty')
    }
    const firstSlashIdx = streamIdOrPath.indexOf('/')
    if (firstSlashIdx === -1) {
        // legacy format
        return streamIdOrPath as StreamID
    } else if (firstSlashIdx === 0) {
        // path-only format
        if (domain === undefined) {
            throw new Error(`path-only format "${streamIdOrPath}" provided without domain`)
        }
        return (domain + streamIdOrPath) as StreamID
    } else {
        const domain = toEthereumAddressOrENSName(streamIdOrPath.substring(0, firstSlashIdx))
        const path = streamIdOrPath.substring(firstSlashIdx)
        return (domain + path) as StreamID
    }
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class StreamIDUtils {
    static isPathOnlyFormat(streamIdOrPath: string): boolean {
        return streamIdOrPath.startsWith('/')
    }

    static getDomain(streamId: StreamID): EthereumAddress | ENSName | undefined {
        const domainAndPath = StreamIDUtils.getDomainAndPath(streamId)
        return domainAndPath?.[0]
    }

    static getPath(streamId: StreamID): string | undefined {
        const domainAndPath = StreamIDUtils.getDomainAndPath(streamId)
        return domainAndPath?.[1]
    }

    static getDomainAndPath(streamId: StreamID): [EthereumAddress | ENSName, string] | undefined {
        const firstSlashIdx = streamId.indexOf('/')
        if (firstSlashIdx !== -1) {
            const domain = streamId.substring(0, firstSlashIdx) as EthereumAddress | ENSName
            return [domain, streamId.substring(firstSlashIdx)]
        } else {
            return undefined
        }
    }
}

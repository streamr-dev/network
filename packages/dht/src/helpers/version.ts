export const LOCAL_PROTOCOL_VERSION = '1.1'

/*
 * When two nodes negotiate whether they are compatible or not, it is up to the
 * newer version to decide if it supports the old version or not.
 *
 * The older version assumes optimistically that it may be supported by the newer
 * version. It can't know for sure, but the other node will tell if it is not
 * supported (e.g. rejecting the handshake with UNSUPPORTED_PROTOCOL_VERSION error).
 */
export const isMaybeSupportedProtocolVersion = (remoteVersion: string): boolean => {
    const localMajor = parseVersion(LOCAL_PROTOCOL_VERSION)!.major
    const remoteMajor = parseVersion(remoteVersion)?.major
    if (remoteMajor === undefined || remoteMajor < localMajor) {
        return false
    } else {
        // TODO implement proper checking when there are new protocol versions
        return true
    }
}

export const parseVersion = (version: string): { major: number; minor: number } | undefined => {
    const parts = version.split('.')
    if (parts.length === 2) {
        const values = parts.map((p) => Number(p))
        if (!values.some((v) => isNaN(v))) {
            return { major: values[0], minor: values[1] }
        }
    } else {
        return undefined
    }
}

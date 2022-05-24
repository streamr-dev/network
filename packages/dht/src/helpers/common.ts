import { PeerID } from './PeerID'
import { PeerDescriptor } from '../proto/DhtRpc'
import { Err } from './errors'

export const generateId = (stringId: string): Uint8Array => {
    return PeerID.fromString(stringId).value
}

export const nodeFormatPeerDescriptor = (peerDescriptor: PeerDescriptor): PeerDescriptor => {
    const formatted: PeerDescriptor = {
        ...peerDescriptor,
        peerId: Uint8Array.from(peerDescriptor.peerId)
    }
    return formatted
}

export function promiseTimeout<T>(ms: number, givenPromise: Promise<T>): Promise<T> {
    const timeoutPromise = new Promise((resolve, reject) => {
        const timeoutRef = setTimeout(() => {
            reject(new Err.RpcTimeout('Timed out in ' + ms + 'ms.'))
        }, ms)

        // Clear timeout if promise wins race
        givenPromise
            .finally(() => clearTimeout(timeoutRef))
            .catch(() => null)
    })

    return Promise.race([
        givenPromise,
        timeoutPromise
    ]) as Promise<T>
}
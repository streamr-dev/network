import type { PeerDescriptor } from '../../../generated/packages/dht/protos/DhtRpc'
import { toNodeId } from '../../identifiers'

/**
 * Retrieves a string representation of a node ID from a given peer descriptor.
 * If the peer descriptor is undefined, it returns 'unknown'.
 * 
 * This function is intended for logging purposes only and should be removed 
 * if the conditions outlined in the TODO comment are met, such as:
 * - Refactoring ConnectionManager to prevent early processing of handshake requests,
 *   ensuring this.localPeerDescriptor is never undefined (NET-1129).
 * - Ensuring the peerDescriptor of ManagedConnection is always available.
 * - Creating stricter types for incoming messages, such as message.sourceDescriptor 
 *   or disconnectNotice.peerDescriptor.
 * - Guaranteeing that ManagedConnection#peerDescriptor is never undefined.
 * 
 * @param peerDescriptor - The peer descriptor from which to derive the node ID, 
 *                        or undefined if not available.
 * @returns A string representation of the node ID or 'unknown' if the peer descriptor is undefined.
 */
export const getNodeIdOrUnknownFromPeerDescriptor = (peerDescriptor: PeerDescriptor | undefined): string => {
    if (peerDescriptor !== undefined) {
        return toNodeId(peerDescriptor)
    } else {
        return 'unknown'
    }
}

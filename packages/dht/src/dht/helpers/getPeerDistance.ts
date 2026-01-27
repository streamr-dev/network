import KBucket from 'k-bucket'
import { DhtAddressRaw } from '../../identifiers'

export const getPeerDistance = (
    nodeIdOrDataKeyRaw1: DhtAddressRaw,
    nodeIdOrDataKeyRaw2: DhtAddressRaw
): number => {
    return KBucket.distance(nodeIdOrDataKeyRaw1, nodeIdOrDataKeyRaw2)
}

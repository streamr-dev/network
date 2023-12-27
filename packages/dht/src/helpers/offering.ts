import crypto from 'crypto'
import { DhtAddress } from '../identifiers'

export const hasSmallerOfferingHashThan = (localNodeId: DhtAddress, remoteNodeId: DhtAddress): boolean => {
    return getOfferingHash(localNodeId + ',' + remoteNodeId) < getOfferingHash(remoteNodeId + ',' + localNodeId)
}

const getOfferingHash = (idPair: string): number => {
    const buffer = crypto.createHash('md5').update(idPair).digest()
    return buffer.readInt32LE(0)
}

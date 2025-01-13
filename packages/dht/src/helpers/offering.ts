import crypto from 'crypto'
import { DhtAddress } from '../identifiers'

type Offerer = 'local' | 'remote'

export const getOfferer = (localNodeId: DhtAddress, remoteNodeId: DhtAddress): Offerer => {
    return getOfferingHash(localNodeId + ',' + remoteNodeId) < getOfferingHash(remoteNodeId + ',' + localNodeId) ? 'local' : 'remote'
}

const getOfferingHash = (idPair: string): number => {
    const buffer = crypto.createHash('md5').update(idPair).digest()
    return buffer.readInt32LE(0)
}

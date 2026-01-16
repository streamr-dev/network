import { computeMd5 } from '@streamr/utils'
import { DhtAddress } from '../identifiers'

type Offerer = 'local' | 'remote'

export const getOfferer = (localNodeId: DhtAddress, remoteNodeId: DhtAddress): Offerer => {
    return getOfferingHash(localNodeId + ',' + remoteNodeId) < getOfferingHash(remoteNodeId + ',' + localNodeId)
        ? 'local'
        : 'remote'
}

const getOfferingHash = (idPair: string): number => {
    return computeMd5(idPair).readInt32LE(0)
}

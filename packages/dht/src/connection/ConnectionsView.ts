import { DhtAddress } from '../identifiers'
import { PeerDescriptor } from '../../generated/packages/dht/protos/DhtRpc'

export interface ConnectionsView {
    getConnections: () => PeerDescriptor[]
    getConnectionCount: () => number
    hasConnection: (nodeId: DhtAddress) => boolean
}

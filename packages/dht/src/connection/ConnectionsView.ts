import { DhtAddress } from '../identifiers'
import { PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'

export interface ConnectionsView {
    getConnections: () => PeerDescriptor[]
    getConnectionCount: () => number
    hasConnection: (nodeId: DhtAddress) => boolean
}

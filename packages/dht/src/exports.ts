/**
 * Importing 'timers' ensures `setImmediate` is available in browsers,
 * as it's polyfilled by `timers-browserify`. In Node.js, it's already global.
 */
import 'timers'

export { DhtNode, type DhtNodeEvents, type DhtNodeOptions } from './dht/DhtNode'
export { ListeningRpcCommunicator } from './transport/ListeningRpcCommunicator'
export { RoutingRpcCommunicator } from './transport/RoutingRpcCommunicator'
export { Simulator, LatencyType } from './connection/simulator/Simulator'
export { SimulatorTransport } from './connection/simulator/SimulatorTransport'
export { getRandomRegion, getRegionDelayMatrix } from './connection/simulator/pings'
export { PeerDescriptor, Message, NodeType, DataEntry } from '../generated/packages/dht/protos/DhtRpc'
export type { ITransport, TransportEvents } from './transport/ITransport'
export { ConnectionManager, type ConnectionLocker, type PortRange, type TlsCertificate } from './connection/ConnectionManager'
export type { ConnectionsView } from './connection/ConnectionsView'
export type { LockID } from './connection/ConnectionLockStates'
export { DefaultConnectorFacade } from './connection/ConnectorFacade'
export type { DhtRpcOptions } from './rpc-protocol/DhtRpcOptions'
export { RpcRemote, EXISTING_CONNECTION_TIMEOUT } from './dht/contact/RpcRemote'
export type { IceServer } from './connection/webrtc/types'
export { DhtCallContext } from './rpc-protocol/DhtCallContext'
export { WebsocketClientConnection } from '@/WebsocketClientConnection'
export { ManagedConnection } from './connection/ManagedConnection'
export { PendingConnection } from './connection/PendingConnection'
export type { IConnection } from './connection/IConnection'
export { ConnectionType } from './connection/IConnection'
export type { ServiceID } from './types/ServiceID'
export type { RingContacts } from './dht/contact/RingContactList'
export { createOutgoingHandshaker } from './connection/Handshaker'
export { 
    type DhtAddress,
    type DhtAddressRaw,
    toDhtAddress,
    toDhtAddressRaw,
    randomDhtAddress,
    areEqualPeerDescriptors,
    toNodeId
} from './identifiers'

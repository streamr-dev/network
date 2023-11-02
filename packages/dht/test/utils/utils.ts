import { DhtNode } from '../../src/dht/DhtNode'
import {
    ClosestPeersRequest,
    ClosestPeersResponse,
    MigrateDataResponse,
    NodeType,
    PeerDescriptor,
    PingRequest,
    PingResponse,
    RouteMessageAck,
    RouteMessageWrapper,
    StoreDataRequest,
    StoreDataResponse,
    WebSocketConnectionResponse,
    FindRequest, 
    DeleteDataResponse
} from '../../src/proto/packages/dht/protos/DhtRpc'
import { RpcMessage } from '../../src/proto/packages/proto-rpc/protos/ProtoRpc'
import { PeerID } from '../../src/helpers/PeerID'
import {
    IDhtNodeRpc,
    IRouterRpc,
    IStoreRpc,
    IWebSocketConnectorRpc
} from '../../src/proto/packages/dht/protos/DhtRpc.server'
import { Simulator } from '../../src/connection/Simulator/Simulator'
import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { v4 } from 'uuid'
import { getRandomRegion } from '../../src/connection/Simulator/pings'
import { Empty } from '../../src/proto/google/protobuf/empty'
import { Any } from '../../src/proto/google/protobuf/any'
import { wait, waitForCondition } from '@streamr/utils'
import { RoutingRpcCommunicator } from '../../src/transport/RoutingRpcCommunicator'
import { SimulatorTransport } from '../../src/connection/Simulator/SimulatorTransport'

export const generateId = (stringId: string): Uint8Array => {
    return PeerID.fromString(stringId).value
}

export const createMockConnectionDhtNode = async (
    stringId: string,
    simulator: Simulator,
    binaryId?: Uint8Array,
    numberOfNodesPerKBucket?: number,
    maxConnections = 80,
    dhtJoinTimeout = 45000
): Promise<DhtNode> => {
    let id: PeerID
    if (binaryId) {
        id = PeerID.fromValue(binaryId)
    } else {
        id = PeerID.fromString(stringId)
    }
    const peerDescriptor: PeerDescriptor = {
        kademliaId: id.value,
        type: NodeType.NODEJS,
        region: getRandomRegion()
    }
    const mockConnectionManager = new SimulatorTransport(peerDescriptor, simulator)
    await mockConnectionManager.start()
    const node = new DhtNode({
        peerDescriptor: peerDescriptor,
        transport: mockConnectionManager,
        numberOfNodesPerKBucket,
        maxConnections: maxConnections,
        dhtJoinTimeout
    })
    await node.start()
    return node
}

export const createMockConnectionLayer1Node = async (
    stringId: string,
    layer0Node: DhtNode,
    serviceId?: string,
    numberOfNodesPerKBucket = 8
): Promise<DhtNode> => {
    const id = PeerID.fromString(stringId)
    const descriptor: PeerDescriptor = {
        kademliaId: id.value,
        type: NodeType.NODEJS,
    }
    const node = new DhtNode({
        peerDescriptor: descriptor, transport: layer0Node,
        serviceId: serviceId ? serviceId : 'layer1', numberOfNodesPerKBucket
    })
    await node.start()
    return node
}

export const createWrappedClosestPeersRequest = (
    sourceDescriptor: PeerDescriptor
): RpcMessage => {

    const routedMessage: ClosestPeersRequest = {
        kademliaId: sourceDescriptor.kademliaId,
        requestId: v4()
    }
    const rpcWrapper: RpcMessage = {
        body: Any.pack(routedMessage, ClosestPeersRequest),
        header: {
            method: 'closestPeersRequest',
            request: 'request'
        },
        requestId: v4()
    }
    return rpcWrapper
}

export const createFindRequest = (
    fetchData: boolean
): FindRequest => {
    const request: FindRequest = {
        fetchData,
        sessionId: v4()
    }
    return request
}

interface IDhtRpcWithError extends IDhtNodeRpc {
    throwPingError: (request: PingRequest) => Promise<PingResponse>
    respondPingWithTimeout: (request: PingRequest) => Promise<PingResponse>
    throwGetClosestPeersError: (request: ClosestPeersRequest) => Promise<ClosestPeersResponse>
}

export const MockDhtRpc: IDhtRpcWithError = {
    async getClosestPeers(): Promise<ClosestPeersResponse> {
        const neighbors = getMockPeers()
        const response: ClosestPeersResponse = {
            peers: neighbors,
            requestId: 'why am i still here'
        }
        return response
    },
    async ping(request: PingRequest): Promise<PingResponse> {
        const response: PingResponse = {
            requestId: request.requestId
        }
        return response
    },
    async leaveNotice(): Promise<Empty> {
        return {}
    },
    async throwPingError(): Promise<PingResponse> {
        throw new Error()
    },
    async respondPingWithTimeout(request: PingRequest): Promise<PingResponse> {
        const response: PingResponse = {
            requestId: request.requestId
        }
        await wait(2000)
        return response
    },
    async throwGetClosestPeersError(): Promise<ClosestPeersResponse> {
        throw new Error('Closest peers error')
    }
}

interface IRouterRpcWithError extends IRouterRpc {
    throwRouteMessageError: (request: RouteMessageWrapper) => Promise<RouteMessageAck>
}

export const mockRouterRpc: IRouterRpcWithError = {
    async routeMessage(routed: RouteMessageWrapper): Promise<RouteMessageAck> {
        const response: RouteMessageAck = {
            requestId: routed.requestId,
            error: ''
        }
        return response
    },
    async forwardMessage(routed: RouteMessageWrapper): Promise<RouteMessageAck> {
        const response: RouteMessageAck = {
            requestId: routed.requestId,
            error: ''
        }
        return response
    },
    async throwRouteMessageError(): Promise<RouteMessageAck> {
        throw new Error()
    }
}

interface IStoreRpcWithError extends IStoreRpc {
    throwStoreDataError: (request: StoreDataRequest) => Promise<StoreDataResponse>
    storeDataErrorString: (request: StoreDataRequest) => Promise<StoreDataResponse>
}

export const mockStoreRpc: IStoreRpcWithError = {
    async storeData(): Promise<StoreDataResponse> {
        return {
            error: ''
        }
    },
    async throwStoreDataError(): Promise<StoreDataResponse> {
        throw new Error('Mock')
    },
    async storeDataErrorString(): Promise<StoreDataResponse> {
        return {
            error: 'Mock'
        }
    },
    async migrateData(): Promise<MigrateDataResponse> {
        return MigrateDataResponse.create()
    },
    async deleteData(): Promise<DeleteDataResponse> {
        return DeleteDataResponse.create()
    }
}

export const mockWebSocketConnectorRpc: IWebSocketConnectorRpc = {
    async requestConnection(): Promise<WebSocketConnectionResponse> {
        const responseConnection: WebSocketConnectionResponse = {
            accepted: true
        }
        return responseConnection
    }
}

export const getMockPeers = (): PeerDescriptor[] => {
    const n1: PeerDescriptor = {
        kademliaId: generateId('Neighbor1'),
        type: NodeType.NODEJS,
    }
    const n2: PeerDescriptor = {
        kademliaId: generateId('Neighbor2'),
        type: NodeType.NODEJS,
    }
    const n3: PeerDescriptor = {
        kademliaId: generateId('Neighbor3'),
        type: NodeType.NODEJS,
    }
    const n4: PeerDescriptor = {
        kademliaId: generateId('Neighbor4'),
        type: NodeType.NODEJS,
    }
    return [
        n1, n2, n3, n4
    ]
}

export const waitConnectionManagersReadyForTesting = async (connectionManagers: ConnectionManager[], limit: number): Promise<void> => {
    connectionManagers.forEach((connectionManager) => garbageCollectConnections(connectionManager, limit))
    try {
        await Promise.all(connectionManagers.map((connectionManager) => waitReadyForTesting(connectionManager, limit)))
    } catch (_err) {
        // did not successfully meet condition but network should be in a stable non-star state
    }
}

export const waitNodesReadyForTesting = async (nodes: DhtNode[], limit: number = 10000): Promise<void> => {
    return waitConnectionManagersReadyForTesting(
        nodes.map((node) => {
            return (node.getTransport() as ConnectionManager)
        }), limit)
}

function garbageCollectConnections(connectionManager: ConnectionManager, limit: number): void {
    const LAST_USED_LIMIT = 100
    connectionManager.garbageCollectConnections(limit, LAST_USED_LIMIT)
}

async function waitReadyForTesting(connectionManager: ConnectionManager, limit: number): Promise<void> {
    const LAST_USED_LIMIT = 100
    connectionManager.garbageCollectConnections(limit, LAST_USED_LIMIT)
    try {
        await waitForCondition(() => {
            return (connectionManager.getNumberOfLocalLockedConnections() === 0 &&
                connectionManager.getNumberOfRemoteLockedConnections() === 0 &&
                connectionManager.getAllConnectionPeerDescriptors().length <= limit)
        }, 20000)
    } catch (err) {
        if (connectionManager.getNumberOfLocalLockedConnections() > 0
            && connectionManager.getNumberOfRemoteLockedConnections() > 0) {
            throw Error('Connections are still locked')
        } else if (connectionManager.getAllConnectionPeerDescriptors().length > limit) {
            throw Error(`ConnectionManager has more than ${limit}`)
        }
    }
}

export function createMockRoutingRpcCommunicator(): RoutingRpcCommunicator {
    return new RoutingRpcCommunicator('router', async (_msg, _doNotConnect) => {})
}

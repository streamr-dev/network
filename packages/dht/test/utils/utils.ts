import { DhtNode } from '../../src/dht/DhtNode'
import {
    ClosestPeersRequest,
    ClosestPeersResponse,
    NodeType,
    PeerDescriptor,
    PingRequest,
    PingResponse,
    RouteMessageAck,
    RouteMessageWrapper,
    StoreDataRequest,
    StoreDataResponse,
    RecursiveOperationRequest, 
    RecursiveOperation
} from '../../src/proto/packages/dht/protos/DhtRpc'
import { RpcMessage } from '../../src/proto/packages/proto-rpc/protos/ProtoRpc'
import {
    IDhtNodeRpc,
    IRouterRpc,
    IStoreRpc,
    IWebsocketConnectorRpc
} from '../../src/proto/packages/dht/protos/DhtRpc.server'
import { Simulator } from '../../src/connection/simulator/Simulator'
import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { v4 } from 'uuid'
import { getRandomRegion } from '../../src/connection/simulator/pings'
import { Empty } from '../../src/proto/google/protobuf/empty'
import { Any } from '../../src/proto/google/protobuf/any'
import { wait, waitForCondition } from '@streamr/utils'
import { SimulatorTransport } from '../../src/connection/simulator/SimulatorTransport'
import { DhtAddress, createRandomDhtAddress, getRawFromDhtAddress } from '../../src/identifiers'

export const createMockPeerDescriptor = (opts?: Partial<Omit<PeerDescriptor, 'nodeId'>>): PeerDescriptor => {
    return {
        nodeId: getRawFromDhtAddress(createRandomDhtAddress()),
        type: NodeType.NODEJS,
        ...opts
    }
}

export const createMockConnectionDhtNode = async (
    simulator: Simulator,
    nodeId?: DhtAddress,
    numberOfNodesPerKBucket?: number,
    maxConnections = 80,
    dhtJoinTimeout = 45000
): Promise<DhtNode> => {
    const peerDescriptor: PeerDescriptor = {
        nodeId: getRawFromDhtAddress(nodeId ?? createRandomDhtAddress()),
        type: NodeType.NODEJS,
        region: getRandomRegion()
    }
    const mockConnectionManager = new SimulatorTransport(peerDescriptor, simulator)
    await mockConnectionManager.start()
    const opts = {
        peerDescriptor: peerDescriptor,
        transport: mockConnectionManager,
        numberOfNodesPerKBucket,
        maxConnections: maxConnections,
        dhtJoinTimeout,
        rpcRequestTimeout: 5000
    }
    const node = new class extends DhtNode {
        async stop(): Promise<void> {
            await super.stop()
            await mockConnectionManager.stop()
        }
    }(opts)
    await node.start()
    return node
}

export const createMockConnectionLayer1Node = async (
    layer0Node: DhtNode,
    serviceId?: string,
    numberOfNodesPerKBucket = 8
): Promise<DhtNode> => {
    const descriptor: PeerDescriptor = {
        nodeId: layer0Node.getLocalPeerDescriptor().nodeId,
        type: NodeType.NODEJS,
    }
    const node = new DhtNode({
        peerDescriptor: descriptor, transport: layer0Node,
        serviceId: serviceId ? serviceId : 'layer1', numberOfNodesPerKBucket,
        rpcRequestTimeout: 10000
    })
    await node.start()
    return node
}

export const createWrappedClosestPeersRequest = (
    sourceDescriptor: PeerDescriptor
): RpcMessage => {

    const routedMessage: ClosestPeersRequest = {
        nodeId: sourceDescriptor.nodeId,
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

export const createFindRequest = (): RecursiveOperationRequest => {
    const request: RecursiveOperationRequest = {
        operation: RecursiveOperation.FIND_NODE,
        sessionId: v4()
    }
    return request
}

interface IDhtRpcWithError extends IDhtNodeRpc {
    throwPingError: (request: PingRequest) => Promise<PingResponse>
    respondPingWithTimeout: (request: PingRequest) => Promise<PingResponse>
    throwGetClosestPeersError: (request: ClosestPeersRequest) => Promise<ClosestPeersResponse>
}

export const createMockDhtRpc = (neighbors: PeerDescriptor[]): IDhtRpcWithError => {
    return {
        async getClosestPeers(): Promise<ClosestPeersResponse> {
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
}

interface IRouterRpcWithError extends IRouterRpc {
    throwRouteMessageError: (request: RouteMessageWrapper) => Promise<RouteMessageAck>
}

export const mockRouterRpc: IRouterRpcWithError = {
    async routeMessage(routed: RouteMessageWrapper): Promise<RouteMessageAck> {
        const response: RouteMessageAck = {
            requestId: routed.requestId
        }
        return response
    },
    async forwardMessage(routed: RouteMessageWrapper): Promise<RouteMessageAck> {
        const response: RouteMessageAck = {
            requestId: routed.requestId
        }
        return response
    },
    async throwRouteMessageError(): Promise<RouteMessageAck> {
        throw new Error()
    }
}

interface IStoreRpcWithError extends IStoreRpc {
    throwStoreDataError: (request: StoreDataRequest) => Promise<StoreDataResponse>
}

export const mockStoreRpc: IStoreRpcWithError = {
    async storeData(): Promise<StoreDataResponse> {
        return {}
    },
    async throwStoreDataError(): Promise<StoreDataResponse> {
        throw new Error('Mock')
    },
    async replicateData(): Promise<Empty> {
        return {}
    }
}

export const mockWebsocketConnectorRpc: IWebsocketConnectorRpc = {
    async requestConnection(): Promise<Empty> {
        return {}
    }
}

export const createMockPeers = (): PeerDescriptor[] => {
    const n1 = createMockPeerDescriptor()
    const n2 = createMockPeerDescriptor()
    const n3 = createMockPeerDescriptor()
    const n4 = createMockPeerDescriptor()
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
            throw new Error('Connections are still locked')
        } else if (connectionManager.getAllConnectionPeerDescriptors().length > limit) {
            throw new Error(`ConnectionManager has more than ${limit}`)
        }
    }
}

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
    ClosestRingPeersResponse
} from '../../generated/packages/dht/protos/DhtRpc'
import { RpcMessage } from '../../generated/packages/proto-rpc/protos/ProtoRpc'
import {
    IDhtNodeRpc,
    IRouterRpc,
    IStoreRpc,
    IWebsocketClientConnectorRpc
} from '../../generated/packages/dht/protos/DhtRpc.server'
import { Simulator } from '../../src/connection/simulator/Simulator'
import { v4 } from 'uuid'
import { getRandomRegion } from '../../src/connection/simulator/pings'
import { Empty } from '../../generated/google/protobuf/empty'
import { Any } from '../../generated/google/protobuf/any'
import { wait } from '@streamr/utils'
import { SimulatorTransport } from '../../src/connection/simulator/SimulatorTransport'
import { DhtAddress, randomDhtAddress, toDhtAddressRaw } from '../../src/identifiers'

export const createMockPeerDescriptor = (opts?: Partial<PeerDescriptor>): PeerDescriptor => {
    return {
        nodeId: toDhtAddressRaw(randomDhtAddress()),
        type: NodeType.NODEJS,
        ...opts
    }
}

export const createMockRingNode = async (
    simulator: Simulator,
    nodeId: DhtAddress,
    region: number
): Promise<DhtNode> => {
    const maxConnections = 80
    const dhtJoinTimeout = 45000

    const peerDescriptor: PeerDescriptor = {
        nodeId: toDhtAddressRaw(nodeId ?? randomDhtAddress()),
        type: NodeType.NODEJS,
        region
        //ipAddress: ipv4ToNumber(ipAddress)
    }
    const mockConnectionManager = new SimulatorTransport(peerDescriptor, simulator)
    await mockConnectionManager.start()
    const opts = {
        peerDescriptor: peerDescriptor,
        transport: mockConnectionManager,
        connectionLocker: mockConnectionManager,
        numberOfNodesPerKBucket: 8,
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

export const createMockConnectionDhtNode = async (
    simulator: Simulator,
    nodeId?: DhtAddress,
    numberOfNodesPerKBucket?: undefined,
    maxConnections = 80,
    dhtJoinTimeout = 45000
): Promise<DhtNode> => {
    const peerDescriptor: PeerDescriptor = {
        nodeId: toDhtAddressRaw(nodeId ?? randomDhtAddress()),
        type: NodeType.NODEJS,
        region: getRandomRegion()
    }
    const mockConnectionManager = new SimulatorTransport(peerDescriptor, simulator)
    await mockConnectionManager.start()
    const opts = {
        peerDescriptor: peerDescriptor,
        transport: mockConnectionManager,
        connectionsView: mockConnectionManager,
        connectionLocker: mockConnectionManager,
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
        peerDescriptor: descriptor,
        transport: layer0Node,
        connectionsView: layer0Node.getConnectionsView(),
        serviceId: serviceId ?? 'layer1',
        numberOfNodesPerKBucket,
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
        async getClosestRingPeers(): Promise<ClosestRingPeersResponse> {
            const response: ClosestRingPeersResponse = {
                leftPeers: neighbors,
                rightPeers: neighbors,
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

export const mockWebsocketClientConnectorRpc: IWebsocketClientConnectorRpc = {
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

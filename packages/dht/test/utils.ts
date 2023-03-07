import { DhtNode } from '../src/dht/DhtNode'
import {
    ClosestPeersRequest,
    ClosestPeersResponse,
    LeaveNotice,
    NodeType,
    PeerDescriptor,
    PingRequest,
    PingResponse,
    RouteMessageAck,
    RouteMessageWrapper,
    StoreDataRequest,
    StoreDataResponse,
    WebSocketConnectionRequest,
    WebSocketConnectionResponse
} from '../src/proto/packages/dht/protos/DhtRpc'
import { RpcMessage } from '../src/proto/packages/proto-rpc/protos/ProtoRpc'
import { PeerID } from '../src/helpers/PeerID'
import {
    IDhtRpcService,
    IRoutingService,
    IStoreService,
    IWebSocketConnectorService
} from '../src/proto/packages/dht/protos/DhtRpc.server'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { Simulator } from '../src/connection/Simulator/Simulator'
import { ConnectionManager } from '../src/connection/ConnectionManager'
import { v4 } from 'uuid'
import { getRandomRegion } from './data/pings'
import { Empty } from '../src/proto/google/protobuf/empty'
import { Any } from '../src/proto/google/protobuf/any'
import { waitForCondition } from '@streamr/utils'

export const generateId = (stringId: string): Uint8Array => {
    return PeerID.fromString(stringId).value
}

export const createMockConnectionDhtNode = async (stringId: string,
    simulator: Simulator,
    binaryId?: Uint8Array,
    K?: number,
    nodeName?: string,
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
        region: getRandomRegion(),
        nodeName: nodeName ? nodeName : stringId
    }

    const mockConnectionManager = new ConnectionManager({
        ownPeerDescriptor: peerDescriptor,
        simulator: simulator,
        nodeName: nodeName ? nodeName : stringId
    })

    const node = new DhtNode({
        peerDescriptor: peerDescriptor,
        transportLayer: mockConnectionManager,
        nodeName: nodeName,
        numberOfNodesPerKBucket: K ? K : 8,
        maxConnections: maxConnections,
        dhtJoinTimeout
    })
    await node.start()

    return node
}

export const createMockConnectionLayer1Node = async (stringId: string, layer0Node: DhtNode, serviceId?: string): Promise<DhtNode> => {
    const id = PeerID.fromString(stringId)
    const descriptor: PeerDescriptor = {
        kademliaId: id.value,
        type: 0,
        nodeName: stringId
    }

    const node = new DhtNode({
        peerDescriptor: descriptor, transportLayer: layer0Node,
        serviceId: serviceId ? serviceId : 'layer1', numberOfNodesPerKBucket: 8, nodeName: stringId
    })
    await node.start()
    return node
}

export const createWrappedClosestPeersRequest = (
    sourceDescriptor: PeerDescriptor,
    _udestinationDescriptor: PeerDescriptor
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

interface IDhtRpcWithError extends IDhtRpcService {
    throwPingError: (request: PingRequest, _context: ServerCallContext) => Promise<PingResponse>
    respondPingWithTimeout: (request: PingRequest, _context: ServerCallContext) => Promise<PingResponse>
    throwGetClosestPeersError: (request: ClosestPeersRequest, _context: ServerCallContext) => Promise<ClosestPeersResponse>
}

export const MockDhtRpc: IDhtRpcWithError = {
    async getClosestPeers(_request: ClosestPeersRequest, _context: ServerCallContext): Promise<ClosestPeersResponse> {
        const neighbors = getMockPeers()
        const response: ClosestPeersResponse = {
            peers: neighbors,
            requestId: 'why am i still here'
        }
        return response
    },
    async ping(request: PingRequest, _context: ServerCallContext): Promise<PingResponse> {
        const response: PingResponse = {
            requestId: request.requestId
        }
        return response
    },
    async leaveNotice(_request: LeaveNotice, _context: ServerCallContext): Promise<Empty> {
        return {}
    },
    async throwPingError(_urequest: PingRequest, _context: ServerCallContext): Promise<PingResponse> {
        throw new Error()
    },
    respondPingWithTimeout(request: PingRequest, _context: ServerCallContext): Promise<PingResponse> {
        return new Promise((resolve, _reject) => {
            const response: PingResponse = {
                requestId: request.requestId
            }
            setTimeout(() => resolve(response), 2000)
        })
    },
    async throwGetClosestPeersError(_urequest: ClosestPeersRequest, _context: ServerCallContext): Promise<ClosestPeersResponse> {
        throw new Error('Closest peers error')
    }
}

interface IRouterServiceWithError extends IRoutingService {
    throwRouteMessageError: (request: RouteMessageWrapper, _context: ServerCallContext) => Promise<RouteMessageAck>
}

export const MockRoutingService: IRouterServiceWithError = {
    async routeMessage(routed: RouteMessageWrapper, _context: ServerCallContext): Promise<RouteMessageAck> {
        const response: RouteMessageAck = {
            requestId: routed.requestId,
            destinationPeer: routed.sourcePeer,
            sourcePeer: routed.destinationPeer,
            error: ''
        }
        return response
    },
    async findRecursively(routed: RouteMessageWrapper, _context: ServerCallContext): Promise<RouteMessageAck> {
        const response: RouteMessageAck = {
            requestId: routed.requestId,
            destinationPeer: routed.sourcePeer,
            sourcePeer: routed.destinationPeer,
            error: ''
        }
        return response
    },
    async forwardMessage(routed: RouteMessageWrapper, _context: ServerCallContext): Promise<RouteMessageAck> {
        const response: RouteMessageAck = {
            requestId: routed.requestId,
            destinationPeer: routed.sourcePeer,
            sourcePeer: routed.destinationPeer,
            error: ''
        }
        return response
    },
    async throwRouteMessageError(_urequest: RouteMessageWrapper, _context: ServerCallContext): Promise<RouteMessageAck> {
        throw new Error()
    }
}

interface IStoreServiceWithError extends IStoreService {
    throwStoreDataError: (request: StoreDataRequest, _context: ServerCallContext) => Promise<StoreDataResponse>
    storeDataErrorString: (request: StoreDataRequest, _context: ServerCallContext) => Promise<StoreDataResponse>
}

export const MockStoreService: IStoreServiceWithError = {
    async storeData(_request: StoreDataRequest, _context: ServerCallContext): Promise<StoreDataResponse> {
        return {
            error: ''
        }
    },
    async throwStoreDataError(_request: StoreDataRequest, _context: ServerCallContext): Promise<StoreDataResponse> {
        throw new Error('Mock')
    },
    async storeDataErrorString(_request: StoreDataRequest, _context: ServerCallContext): Promise<StoreDataResponse> {
        return {
            error: 'Mock'
        }
    }
}

export const MockWebSocketConnectorRpc: IWebSocketConnectorService = {
    async requestConnection(request: WebSocketConnectionRequest, _context: ServerCallContext): Promise<WebSocketConnectionResponse> {
        const responseConnection: WebSocketConnectionResponse = {
            target: request.target,
            requester: request.requester,
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
        kademliaId: generateId('Neighbor1'),
        type: NodeType.BROWSER,
    }
    return [
        n1, n2, n3, n4
    ]
}

export const waitConnectionManagersReadyForTesting = async (connectionManagers: ConnectionManager[], limit: number): Promise<void> => {
    connectionManagers.forEach((connectionManager) => garbageCollectConnections(connectionManager, limit))
    await Promise.all(connectionManagers.map((connectionManager) => waitReadyForTesting(connectionManager, limit)))
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
        } else if (connectionManager.getAllConnectionPeerDescriptors().length > limit + 5) {
            throw Error(`ConnectionManager has more than ${limit} + 5 connections after 20 seconds`)
        }
    }

}


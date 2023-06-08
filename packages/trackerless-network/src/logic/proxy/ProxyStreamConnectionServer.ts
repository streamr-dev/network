import { ServerCallContext } from "@protobuf-ts/runtime-rpc"
import { ProxyConnectionRequest, ProxyConnectionResponse, ProxyDirection } from "../../proto/packages/trackerless-network/protos/NetworkRpc"
import { IProxyConnectionRpc } from "../../proto/packages/trackerless-network/protos/NetworkRpc.server"
import { RemoteRandomGraphNode } from "../RemoteRandomGraphNode"
import { ListeningRpcCommunicator, PeerDescriptor, PeerIDKey } from "@streamr/dht"
import { toProtoRpcClient } from "@streamr/proto-rpc"
import { NetworkRpcClient } from "../../proto/packages/trackerless-network/protos/NetworkRpc.client"
import { EventEmitter } from "eventemitter3"
import { Logger } from "@streamr/utils"

const logger = new Logger(module)

interface ProxyConnection {
    direction: ProxyDirection // Direction is from the client's point of view
    userId: string
    remote: RemoteRandomGraphNode
}

interface ProxyStreamConnectionServerConfig {
    ownPeerDescriptor: PeerDescriptor
    streamPartId: string
    rpcCommunicator: ListeningRpcCommunicator
}

export interface Events {
    newConnection: (peerKey: PeerIDKey) => void
}

export class ProxyStreamConnectionServer extends EventEmitter<Events> implements IProxyConnectionRpc {

    private readonly config: ProxyStreamConnectionServerConfig
    private readonly connections: Map<PeerIDKey, ProxyConnection> = new Map()

    constructor(config: ProxyStreamConnectionServerConfig) {
        super()
        this.config = config
        this.config.rpcCommunicator.registerRpcMethod(ProxyConnectionRequest, ProxyConnectionResponse, 'requestConnection',
            (msg: ProxyConnectionRequest, context) => this.requestConnection(msg, context))
    }

    getConnection(peerKey: PeerIDKey): ProxyConnection | undefined {
        return this.connections.get(peerKey)
    }

    hasConnection(peerKey: PeerIDKey): boolean {
        return this.connections.has(peerKey)
    }

    removeConnection(peerKey: PeerIDKey): void {
        this.connections.delete(peerKey)
    }

    stop(): void {
        this.connections.clear()
        this.removeAllListeners()
    }

    getConnectedPeerIds(): PeerIDKey[] {
        return Array.from(this.connections.keys())
    }

    // IProxyConnectionRpc server method
    async requestConnection(request: ProxyConnectionRequest, _context: ServerCallContext): Promise<ProxyConnectionResponse> {
        this.connections.set(request.senderId as PeerIDKey, {
            direction: request.direction,
            userId: request.userId,
            remote: new RemoteRandomGraphNode(
                request.senderDescriptor!,
                this.config.streamPartId,
                toProtoRpcClient(new NetworkRpcClient(this.config.rpcCommunicator.getRpcClientTransport()))    
            )
        })
        const response: ProxyConnectionResponse = {
            accepted: true,
            streamId: request.streamId,
            streamPartition: request.streamPartition,
            direction: request.direction,
            senderId: request.senderId
        }
        logger.trace(`Accepted connection request from ${request.senderId} to ${request.streamId}/${request.streamPartition}`)
        this.emit('newConnection', request.senderId as PeerIDKey)
        return response
    }
}

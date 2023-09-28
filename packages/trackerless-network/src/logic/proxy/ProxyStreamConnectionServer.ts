import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { ProxyConnectionRequest, ProxyConnectionResponse, ProxyDirection } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { IProxyConnectionRpc } from '../../proto/packages/trackerless-network/protos/NetworkRpc.server'
import { RemoteRandomGraphNode } from '../RemoteRandomGraphNode'
import { ListeningRpcCommunicator, PeerDescriptor } from '@streamr/dht'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { NetworkRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { EventEmitter } from 'eventemitter3'
import { EthereumAddress, Logger, binaryToHex, toEthereumAddress } from '@streamr/utils'
import { StreamPartID } from '@streamr/protocol'
import { NodeID, getNodeIdFromPeerDescriptor } from '../../identifiers'
import { DhtCallContext } from '@streamr/dht/src/exports'

const logger = new Logger(module)

interface ProxyConnection {
    direction: ProxyDirection // Direction is from the client's point of view
    userId: EthereumAddress
    remote: RemoteRandomGraphNode
}

interface ProxyStreamConnectionServerConfig {
    ownPeerDescriptor: PeerDescriptor
    streamPartId: StreamPartID
    rpcCommunicator: ListeningRpcCommunicator
}

export interface Events {
    newConnection: (nodeId: NodeID) => void
}

export class ProxyStreamConnectionServer extends EventEmitter<Events> implements IProxyConnectionRpc {

    private readonly config: ProxyStreamConnectionServerConfig
    private readonly connections: Map<NodeID, ProxyConnection> = new Map()

    constructor(config: ProxyStreamConnectionServerConfig) {
        super()
        this.config = config
        this.config.rpcCommunicator.registerRpcMethod(ProxyConnectionRequest, ProxyConnectionResponse, 'requestConnection',
            (msg: ProxyConnectionRequest, context) => this.requestConnection(msg, context))
    }

    getConnection(nodeId: NodeID): ProxyConnection | undefined {
        return this.connections.get(nodeId)
    }

    hasConnection(nodeId: NodeID): boolean {
        return this.connections.has(nodeId)
    }

    removeConnection(nodeId: NodeID): void {
        this.connections.delete(nodeId)
    }

    stop(): void {
        this.connections.forEach((connection) => connection.remote.leaveStreamNotice(this.config.ownPeerDescriptor))
        this.connections.clear()
        this.removeAllListeners()
    }

    getConnectedNodeIds(): NodeID[] {
        return Array.from(this.connections.keys())
    }

    getConnections(): ProxyConnection[] {
        return Array.from(this.connections.values())
    }

    getSubscribers(): NodeID[] {
        return Array.from(this.connections.keys()).filter((key) => this.connections.get(key)!.direction === ProxyDirection.SUBSCRIBE)
    }

    public getNodeIdsForUserId(userId: EthereumAddress): NodeID[] {
        return Array.from(this.connections.keys()).filter((nodeId) => this.connections.get(nodeId)!.userId === userId)
    }

    // IProxyConnectionRpc server method
    async requestConnection(request: ProxyConnectionRequest, context: ServerCallContext): Promise<ProxyConnectionResponse> {
        const senderPeerDescriptor = (context as DhtCallContext).sourceDescriptor!
        this.connections.set(getNodeIdFromPeerDescriptor(senderPeerDescriptor), {
            direction: request.direction,
            userId: toEthereumAddress(binaryToHex(request.userId, true)),
            remote: new RemoteRandomGraphNode(
                senderPeerDescriptor,
                this.config.streamPartId,
                toProtoRpcClient(new NetworkRpcClient(this.config.rpcCommunicator.getRpcClientTransport()))    
            )
        })
        const response: ProxyConnectionResponse = {
            accepted: true
        }
        logger.trace(`Accepted connection request from ${request.senderId} to ${request.streamId}/${request.streamPartition}`)
        this.emit('newConnection', binaryToHex(request.senderId) as NodeID)
        return response
    }
}

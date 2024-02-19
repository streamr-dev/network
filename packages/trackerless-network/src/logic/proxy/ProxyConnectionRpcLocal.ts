import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { 
    ProxyConnectionRequest,
    ProxyConnectionResponse,
    ProxyDirection,
    StreamMessage
} from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { IProxyConnectionRpc } from '../../proto/packages/trackerless-network/protos/NetworkRpc.server'
import { DeliveryRpcRemote } from '../DeliveryRpcRemote'
import { DhtAddress, DhtCallContext, ListeningRpcCommunicator, PeerDescriptor, getNodeIdFromPeerDescriptor } from '@streamr/dht'
import { DeliveryRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { EventEmitter } from 'eventemitter3'
import { EthereumAddress, Logger, binaryToHex, toEthereumAddress } from '@streamr/utils'
import { StreamPartID } from '@streamr/protocol'

const logger = new Logger(module)

interface ProxyConnection {
    direction: ProxyDirection // Direction is from the client's point of view
    userId: EthereumAddress
    remote: DeliveryRpcRemote
}

interface ProxyConnectionRpcLocalConfig {
    localPeerDescriptor: PeerDescriptor
    streamPartId: StreamPartID
    rpcCommunicator: ListeningRpcCommunicator
}

export interface Events {
    newConnection: (nodeId: DhtAddress) => void
}

export class ProxyConnectionRpcLocal extends EventEmitter<Events> implements IProxyConnectionRpc {

    private readonly config: ProxyConnectionRpcLocalConfig
    private readonly connections: Map<DhtAddress, ProxyConnection> = new Map()

    constructor(config: ProxyConnectionRpcLocalConfig) {
        super()
        this.config = config
        this.config.rpcCommunicator.registerRpcMethod(ProxyConnectionRequest, ProxyConnectionResponse, 'requestConnection',
            (msg: ProxyConnectionRequest, context) => this.requestConnection(msg, context))
    }

    getConnection(nodeId: DhtAddress): ProxyConnection | undefined {
        return this.connections.get(nodeId)
    }

    hasConnection(nodeId: DhtAddress): boolean {
        return this.connections.has(nodeId)
    }

    removeConnection(nodeId: DhtAddress): void {
        this.connections.delete(nodeId)
    }

    stop(): void {
        this.connections.forEach((connection) => connection.remote.leaveStreamPartNotice(this.config.streamPartId, false))
        this.connections.clear()
        this.removeAllListeners()
    }

    getPropagationTargets(msg: StreamMessage): DhtAddress[] {
        if (msg.body.oneofKind === 'groupKeyRequest') {
            try {
                const recipientId = msg.body.groupKeyRequest.recipientId
                return this.getNodeIdsForUserId(toEthereumAddress(binaryToHex(recipientId, true)))
            } catch (err) {
                logger.trace(`Could not parse GroupKeyRequest: ${err}`)
                return []
            }
        } else {
            return this.getSubscribers()
        }
    }

    private getNodeIdsForUserId(userId: EthereumAddress): DhtAddress[] {
        return Array.from(this.connections.keys()).filter((nodeId) => this.connections.get(nodeId)!.userId === userId)
    }

    private getSubscribers(): DhtAddress[] {
        return Array.from(this.connections.keys()).filter((key) => this.connections.get(key)!.direction === ProxyDirection.SUBSCRIBE)
    }

    // IProxyConnectionRpc server method
    async requestConnection(request: ProxyConnectionRequest, context: ServerCallContext): Promise<ProxyConnectionResponse> {
        const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        const senderId = getNodeIdFromPeerDescriptor(senderPeerDescriptor)
        this.connections.set(senderId, {
            direction: request.direction,
            userId: toEthereumAddress(binaryToHex(request.userId, true)),
            remote: new DeliveryRpcRemote(
                this.config.localPeerDescriptor,
                senderPeerDescriptor,
                this.config.rpcCommunicator,
                DeliveryRpcClient
            )
        })
        const response: ProxyConnectionResponse = {
            accepted: true
        }
        logger.trace(`Accepted connection request from ${senderId} to ${this.config.streamPartId}`)
        this.emit('newConnection', senderId)
        return response
    }
}

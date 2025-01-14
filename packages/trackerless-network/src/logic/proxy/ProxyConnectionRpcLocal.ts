import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { DhtAddress, DhtCallContext, ListeningRpcCommunicator, PeerDescriptor, toNodeId } from '@streamr/dht'
import { Logger, StreamPartID, toUserId, UserID } from '@streamr/utils'
import { EventEmitter } from 'eventemitter3'
import {
    ProxyConnectionRequest,
    ProxyConnectionResponse,
    ProxyDirection,
    StreamMessage
} from '../../../generated/packages/trackerless-network/protos/NetworkRpc'
import { ContentDeliveryRpcClient } from '../../../generated/packages/trackerless-network/protos/NetworkRpc.client'
import { IProxyConnectionRpc } from '../../../generated/packages/trackerless-network/protos/NetworkRpc.server'
import { ContentDeliveryRpcRemote } from '../ContentDeliveryRpcRemote'

const logger = new Logger(module)

interface ProxyConnection {
    direction: ProxyDirection // Direction is from the client's point of view
    userId: UserID
    remote: ContentDeliveryRpcRemote
}

interface ProxyConnectionRpcLocalOptions {
    localPeerDescriptor: PeerDescriptor
    streamPartId: StreamPartID
    rpcCommunicator: ListeningRpcCommunicator
}

export interface Events {
    newConnection: (nodeId: DhtAddress) => void
}

export class ProxyConnectionRpcLocal extends EventEmitter<Events> implements IProxyConnectionRpc {
    private readonly options: ProxyConnectionRpcLocalOptions
    private readonly connections: Map<DhtAddress, ProxyConnection> = new Map()

    constructor(options: ProxyConnectionRpcLocalOptions) {
        super()
        this.options = options
        this.options.rpcCommunicator.registerRpcMethod(
            ProxyConnectionRequest,
            ProxyConnectionResponse,
            'requestConnection',
            (msg: ProxyConnectionRequest, context) => this.requestConnection(msg, context)
        )
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
        this.connections.forEach((connection) =>
            connection.remote.leaveStreamPartNotice(this.options.streamPartId, false)
        )
        this.connections.clear()
        this.removeAllListeners()
    }

    getPropagationTargets(msg: StreamMessage): DhtAddress[] {
        if (msg.body.oneofKind === 'groupKeyRequest') {
            try {
                const recipientId = msg.body.groupKeyRequest.recipientId
                return this.getNodeIdsForUserId(toUserId(recipientId))
            } catch (err) {
                logger.trace(`Could not parse GroupKeyRequest`, { err })
                return []
            }
        } else {
            return this.getSubscribers()
        }
    }

    private getNodeIdsForUserId(userId: UserID): DhtAddress[] {
        return Array.from(this.connections.keys()).filter((nodeId) => this.connections.get(nodeId)!.userId === userId)
    }

    private getSubscribers(): DhtAddress[] {
        return Array.from(this.connections.keys()).filter(
            (key) => this.connections.get(key)!.direction === ProxyDirection.SUBSCRIBE
        )
    }

    // IProxyConnectionRpc server method
    async requestConnection(
        request: ProxyConnectionRequest,
        context: ServerCallContext
    ): Promise<ProxyConnectionResponse> {
        const senderPeerDescriptor = (context as DhtCallContext).incomingSourceDescriptor!
        const remoteNodeId = toNodeId(senderPeerDescriptor)
        this.connections.set(remoteNodeId, {
            direction: request.direction,
            userId: toUserId(request.userId),
            remote: new ContentDeliveryRpcRemote(
                this.options.localPeerDescriptor,
                senderPeerDescriptor,
                this.options.rpcCommunicator,
                ContentDeliveryRpcClient
            )
        })
        const response: ProxyConnectionResponse = {
            accepted: true
        }
        logger.trace(`Accepted connection request from ${remoteNodeId} to ${this.options.streamPartId}`)
        this.emit('newConnection', remoteNodeId)
        return response
    }
}

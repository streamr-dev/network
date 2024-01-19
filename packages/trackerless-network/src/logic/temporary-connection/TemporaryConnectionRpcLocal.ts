import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { TemporaryConnectionRequest, TemporaryConnectionResponse } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { ITemporaryConnectionRpc } from '../../proto/packages/trackerless-network/protos/NetworkRpc.server'
import { DhtAddress, DhtCallContext, ListeningRpcCommunicator, getNodeIdFromPeerDescriptor } from '@streamr/dht'
import { DeliveryRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { NodeList } from '../NodeList'
import { DeliveryRpcRemote } from '../DeliveryRpcRemote'
import { PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'

interface TemporaryConnectionRpcLocalConfig {
    rpcCommunicator: ListeningRpcCommunicator
    localPeerDescriptor: PeerDescriptor
} 

export class TemporaryConnectionRpcLocal implements ITemporaryConnectionRpc {

    private readonly config: TemporaryConnectionRpcLocalConfig
    private readonly temporaryNodes: NodeList

    constructor(config: TemporaryConnectionRpcLocalConfig) {
        this.config = config
        // TODO use config option or named constant?
        this.temporaryNodes = new NodeList(getNodeIdFromPeerDescriptor(config.localPeerDescriptor), 10)
    }

    getNodes(): NodeList {
        return this.temporaryNodes
    }

    hasNode(node: DhtAddress): boolean {
        return this.temporaryNodes.has(node)
    }

    removeNode(nodeId: DhtAddress): void {
        this.temporaryNodes.remove(nodeId)
    }

    async openConnection(
        _request: TemporaryConnectionRequest,
        context: ServerCallContext
    ): Promise<TemporaryConnectionResponse> {
        const sender = (context as DhtCallContext).incomingSourceDescriptor!
        const remote = new DeliveryRpcRemote(
            this.config.localPeerDescriptor,
            sender,
            this.config.rpcCommunicator,
            DeliveryRpcClient
        )
        this.temporaryNodes.add(remote)
        return {
            accepted: true
        }
    }
}

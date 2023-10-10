import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { TemporaryConnectionRequest, TemporaryConnectionResponse } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { ITemporaryConnectionRpc } from '../../proto/packages/trackerless-network/protos/NetworkRpc.server'
import { DhtCallContext, ListeningRpcCommunicator } from '@streamr/dht'
import { NetworkRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { NodeList } from '../NodeList'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { RemoteRandomGraphNode } from '../RemoteRandomGraphNode'
import { PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import { getNodeIdFromPeerDescriptor } from '../../identifiers'

interface TemporaryConnectionRpcServerConfig {
    randomGraphId: string
    rpcCommunicator: ListeningRpcCommunicator
    ownPeerDescriptor: PeerDescriptor
} 

export class TemporaryConnectionRpcServer implements ITemporaryConnectionRpc {

    private readonly config: TemporaryConnectionRpcServerConfig
    private readonly temporaryNodes: NodeList

    constructor(config: TemporaryConnectionRpcServerConfig) {
        this.config = config
        this.temporaryNodes = new NodeList(getNodeIdFromPeerDescriptor(config.ownPeerDescriptor), 10)
    }

    getNodes(): NodeList {
        return this.temporaryNodes
    }

    removeNode(peerDescriptor: PeerDescriptor): void {
        this.temporaryNodes.remove(peerDescriptor)
    }

    async openConnection(
        _request: TemporaryConnectionRequest,
        context: ServerCallContext
    ): Promise<TemporaryConnectionResponse> {
        const sender = (context as DhtCallContext).incomingSourceDescriptor!
        const remote = new RemoteRandomGraphNode(
            this.config.ownPeerDescriptor,
            sender,
            this.config.randomGraphId,
            toProtoRpcClient(new NetworkRpcClient(this.config.rpcCommunicator.getRpcClientTransport()))
        )
        this.temporaryNodes.add(remote)
        return {
            accepted: true
        }
    }
}

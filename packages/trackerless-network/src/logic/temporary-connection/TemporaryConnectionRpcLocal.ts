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
import { StreamPartID } from '@streamr/protocol'

interface TemporaryConnectionRpcLocalConfig {
    streamPartId: StreamPartID
    rpcCommunicator: ListeningRpcCommunicator
    ownPeerDescriptor: PeerDescriptor
} 

export class TemporaryConnectionRpcLocal implements ITemporaryConnectionRpc {

    private readonly config: TemporaryConnectionRpcLocalConfig
    private readonly temporaryNodes: NodeList

    constructor(config: TemporaryConnectionRpcLocalConfig) {
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
            this.config.streamPartId,
            toProtoRpcClient(new NetworkRpcClient(this.config.rpcCommunicator.getRpcClientTransport()))
        )
        this.temporaryNodes.add(remote)
        return {
            accepted: true
        }
    }
}

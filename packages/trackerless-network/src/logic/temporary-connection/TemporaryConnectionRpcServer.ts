import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { TemporaryConnectionRequest, TemporaryConnectionResponse } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { ITemporaryConnectionRpc } from '../../proto/packages/trackerless-network/protos/NetworkRpc.server'
import { DhtCallContext, ListeningRpcCommunicator, PeerID } from '@streamr/dht'
import { NetworkRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { NodeList } from '../NodeList'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { RemoteRandomGraphNode } from '../RemoteRandomGraphNode'
import { PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'

interface TemporaryConnectionRpcServerConfig {
    randomGraphId: string
    rpcCommunicator: ListeningRpcCommunicator
    ownPeerId: PeerID
} 

export class TemporaryConnectionRpcServer implements ITemporaryConnectionRpc {

    private readonly config: TemporaryConnectionRpcServerConfig
    private readonly temporaryPeers: NodeList

    constructor(config: TemporaryConnectionRpcServerConfig) {
        this.config = config
        this.temporaryPeers = new NodeList(config.ownPeerId, 10)
    }

    getPeers(): NodeList {
        return this.temporaryPeers
    }

    removePeer(peer: PeerDescriptor): void {
        this.temporaryPeers.remove(peer)
    }

    async openConnection(
        _request: TemporaryConnectionRequest,
        context: ServerCallContext
    ): Promise<TemporaryConnectionResponse> {
        const sender = (context as DhtCallContext).incomingSourceDescriptor!
        const remote = new RemoteRandomGraphNode(
            sender,
            this.config.randomGraphId,
            toProtoRpcClient(new NetworkRpcClient(this.config.rpcCommunicator.getRpcClientTransport()))
        )
        this.temporaryPeers.add(remote)
        return {
            accepted: true
        }
    }
}

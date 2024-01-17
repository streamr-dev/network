import { DhtCallContext, PeerDescriptor } from '@streamr/dht'
import { NodeInfoResponse } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { NodeInfoRpcRemote } from './NodeInfoRpcRemote'
import { RpcCommunicator } from '@streamr/proto-rpc'
import { NodeInfoRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'

export class NodeInfoClient {
    private readonly ownPeerDescriptor: PeerDescriptor
    private readonly rpcCommunicator: RpcCommunicator<DhtCallContext>

    constructor(ownPeerDescriptor: PeerDescriptor, rpcCommunicator: RpcCommunicator<DhtCallContext>) {
        this.ownPeerDescriptor = ownPeerDescriptor
        this.rpcCommunicator = rpcCommunicator
    }

    async getInfo(node: PeerDescriptor): Promise<NodeInfoResponse> {
        const remote = new NodeInfoRpcRemote(this.ownPeerDescriptor, node, this.rpcCommunicator, NodeInfoRpcClient)
        return remote.getInfo()
    }

}

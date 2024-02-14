import { DhtCallContext, PeerDescriptor } from '@streamr/dht'
import { RpcCommunicator } from '@streamr/proto-rpc'
import { NodeInfo } from '../../NetworkStack'
import { NodeInfoRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { NodeInfoRpcRemote } from './NodeInfoRpcRemote'

export class NodeInfoClient {
    private readonly ownPeerDescriptor: PeerDescriptor
    private readonly rpcCommunicator: RpcCommunicator<DhtCallContext>

    constructor(ownPeerDescriptor: PeerDescriptor, rpcCommunicator: RpcCommunicator<DhtCallContext>) {
        this.ownPeerDescriptor = ownPeerDescriptor
        this.rpcCommunicator = rpcCommunicator
    }

    async getInfo(node: PeerDescriptor): Promise<NodeInfo> {
        const remote = new NodeInfoRpcRemote(this.ownPeerDescriptor, node, this.rpcCommunicator, NodeInfoRpcClient)
        return remote.getInfo()
    }

}

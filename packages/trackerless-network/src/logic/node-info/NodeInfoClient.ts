import { DhtCallContext, PeerDescriptor } from '@streamr/dht'
import { RpcCommunicator } from '@streamr/proto-rpc'
import { NodeInfo } from '../../types'
import { NodeInfoRpcClient } from '../../../generated/packages/trackerless-network/protos/NetworkRpc.client'
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
        // TODO remove casting when we validate NodeInfoResponse messages and therefore can annotate
        // each of the field as required in the decorated type
        return remote.getInfo() as unknown as NodeInfo
    }
}

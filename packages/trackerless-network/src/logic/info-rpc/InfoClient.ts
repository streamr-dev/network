import { DhtCallContext, PeerDescriptor } from '@streamr/dht'
import { InfoResponse } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { InfoRpcRemote } from './InfoRpcRemote'
import { RpcCommunicator } from '@streamr/proto-rpc'
import { InfoRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'

export class InfoClient {
    private readonly ownPeerDescriptor: PeerDescriptor
    private readonly rpcCommunicator: RpcCommunicator<DhtCallContext>

    constructor(ownPeerDescriptor: PeerDescriptor, rpcCommunicator: RpcCommunicator<DhtCallContext>) {
        this.ownPeerDescriptor = ownPeerDescriptor
        this.rpcCommunicator = rpcCommunicator
    }

    async getInfo(node: PeerDescriptor): Promise<InfoResponse> {
        const remote = new InfoRpcRemote(this.ownPeerDescriptor, node, this.rpcCommunicator, InfoRpcClient)
        return remote.getInfo()
    }

}

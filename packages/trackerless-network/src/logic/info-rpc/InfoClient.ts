import { PeerDescriptor } from '@streamr/dht'
import { InfoResponse } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { RemoteInfoRpcServer } from './RemoteInfoRpcServer'
import { ProtoRpcClient, RpcCommunicator, toProtoRpcClient } from '@streamr/proto-rpc'
import { IInfoRpcClient, InfoRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { INFO_RPC_SERVICE_ID } from './InfoRpcServer'
import { StreamPartID } from '@streamr/protocol'

export class InfoClient {
    private readonly ownPeerDescriptor: PeerDescriptor
    private readonly rpcCommunicator: RpcCommunicator
    private readonly infoRpcClient: ProtoRpcClient<IInfoRpcClient>

    constructor(ownPeerDescriptor: PeerDescriptor, rpcCommunicator: RpcCommunicator) {
        this.ownPeerDescriptor = ownPeerDescriptor
        this.rpcCommunicator = rpcCommunicator
        this.infoRpcClient = toProtoRpcClient(new InfoRpcClient(this.rpcCommunicator.getRpcClientTransport()))
    }

    async getInfo(
        node: PeerDescriptor,
        getConnectionManagerInfo: boolean,
        getLayer0DhtNodeInfo: boolean,
        streamParts: StreamPartID[]
    ): Promise<InfoResponse> {
        const remote = new RemoteInfoRpcServer(node, INFO_RPC_SERVICE_ID, this.infoRpcClient)
        return remote.getInfo(this.ownPeerDescriptor, getConnectionManagerInfo, getLayer0DhtNodeInfo, streamParts)
    }
}

import { DhtCallContext, PeerDescriptor } from '@streamr/dht'
import { InfoResponse } from '../../proto/packages/trackerless-network/protos/NetworkRpc'
import { RemoteInfoRpcServer } from './RemoteInfoRpcServer'
import { ProtoRpcClient, RpcCommunicator, toProtoRpcClient } from '@streamr/proto-rpc'
import { IInfoRpcClient, InfoRpcClient } from '../../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { StreamPartID } from '@streamr/protocol'

export class InfoClient {
    private readonly ownPeerDescriptor: PeerDescriptor
    private readonly rpcCommunicator: RpcCommunicator<DhtCallContext>
    private readonly infoRpcClient: ProtoRpcClient<IInfoRpcClient>

    constructor(ownPeerDescriptor: PeerDescriptor, rpcCommunicator: RpcCommunicator<DhtCallContext>) {
        this.ownPeerDescriptor = ownPeerDescriptor
        this.rpcCommunicator = rpcCommunicator
        this.infoRpcClient = toProtoRpcClient(new InfoRpcClient(this.rpcCommunicator.getRpcClientTransport()))
    }

    async getInfo(
        node: PeerDescriptor,
        getControlLayerInfo: boolean,
        streamParts: StreamPartID[]
    ): Promise<InfoResponse> {
        const remote = new RemoteInfoRpcServer(this.ownPeerDescriptor, node, this.rpcCommunicator, InfoRpcClient)
        return remote.getInfo(getControlLayerInfo, streamParts)
    }
}

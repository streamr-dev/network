import { ServerCallContext } from "@protobuf-ts/runtime-rpc"
import { InspectConnectionRequest, InspectConnectionResponse } from "../../proto/packages/trackerless-network/protos/NetworkRpc"
import { IInspectionRpc } from "../../proto/packages/trackerless-network/protos/NetworkRpc.server"
import { DhtCallContext, ListeningRpcCommunicator, PeerID } from "@streamr/dht"
import { NetworkRpcClient } from "../../proto/packages/trackerless-network/protos/NetworkRpc.client"
import { PeerList } from "../PeerList"
import { toProtoRpcClient } from "@streamr/proto-rpc"
import { RemoteRandomGraphNode } from "../RemoteRandomGraphNode"
import { PeerDescriptor } from "../../proto/packages/dht/protos/DhtRpc"

interface InspectionRpcServerConfig {
    randomGraphId: string
    rpcCommunicator: ListeningRpcCommunicator
    ownPeerId: PeerID
} 

export class InspectionRpcServer implements IInspectionRpc {

    private readonly config: InspectionRpcServerConfig
    private readonly inspectingPeers: PeerList

    constructor(config: InspectionRpcServerConfig) {
        this.config = config
        this.inspectingPeers = new PeerList(config.ownPeerId, 10)
    }

    getInspectingPeers(): PeerList {
        return this.inspectingPeers
    }

    removePeer(peer: PeerDescriptor): void {
        this.inspectingPeers.remove(peer)
    }

    async openInspectConnection(
        _request: InspectConnectionRequest,
        context: ServerCallContext
    ): Promise<InspectConnectionResponse> {
        const sender = (context as DhtCallContext).incomingSourceDescriptor!
        const remote = new RemoteRandomGraphNode(
            sender,
            this.config.randomGraphId,
            toProtoRpcClient(new NetworkRpcClient(this.config.rpcCommunicator.getRpcClientTransport()))
        )
        this.inspectingPeers.add(remote)
        return {
            accepted: true
        }
    }
}

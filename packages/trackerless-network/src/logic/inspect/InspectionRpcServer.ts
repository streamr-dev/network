import { ServerCallContext } from "@protobuf-ts/runtime-rpc"
import { InspectConnectionRequest, InspectConnectionResponse } from "../../proto/packages/trackerless-network/protos/NetworkRpc"
import { IInspectionRpc } from "../../proto/packages/trackerless-network/protos/NetworkRpc.server"
import { DhtCallContext, PeerDescriptor } from "@streamr/dht"

interface InspectionRpcServerConfig {
    onInspectConnection: (sender: PeerDescriptor) => void
}

export class InspectionRpcServer implements IInspectionRpc {

    private readonly config: InspectionRpcServerConfig

    constructor(config: InspectionRpcServerConfig) {
        this.config = config
    }

    async openInspectConnection(
        _request: InspectConnectionRequest,
        context: ServerCallContext
    ): Promise<InspectConnectionResponse> {
        const sender = (context as DhtCallContext).incomingSourceDescriptor!
        this.config.onInspectConnection(sender)
        return {
            accepted: true
        }
    }
}

import { ServerCallContext } from "@protobuf-ts/runtime-rpc"
import { InspectConnectionRequest, InspectConnectionResponse } from "../../proto/packages/trackerless-network/protos/NetworkRpc"
import { IInspectionService } from "../../proto/packages/trackerless-network/protos/NetworkRpc.server"
import { DhtCallContext, PeerDescriptor } from "@streamr/dht"

interface InspectionServiceServerConfig {
    onInspectConnection: (sender: PeerDescriptor) => void
}

export class InspectionServiceServer implements IInspectionService {

    private readonly config: InspectionServiceServerConfig

    constructor(config: InspectionServiceServerConfig) {
        this.config = config
    }

    async inspectConnection(
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

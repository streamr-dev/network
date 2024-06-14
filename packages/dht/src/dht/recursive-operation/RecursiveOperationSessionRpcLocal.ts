import { IRecursiveOperationSessionRpc } from '../../proto/packages/dht/protos/DhtRpc.server'
import { Empty } from '../../proto/google/protobuf/empty'
import { DataEntry, RecursiveOperationResponse, PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import { Logger } from '@streamr/utils'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { DhtCallContext } from '../../rpc-protocol/DhtCallContext'
import { DhtAddress, getNodeIdFromPeerDescriptor } from '../../identifiers'

const logger = new Logger(module)

interface RecursiveOperationSessionRpcLocalConfig {
    onResponseReceived: (
        remoteNodeId: DhtAddress,
        routingPath: PeerDescriptor[],
        nodes: PeerDescriptor[],
        dataEntries: DataEntry[],
        noCloserNodesFound: boolean
    ) => void
}

export class RecursiveOperationSessionRpcLocal implements IRecursiveOperationSessionRpc {

    private readonly config: RecursiveOperationSessionRpcLocalConfig

    constructor(config: RecursiveOperationSessionRpcLocalConfig) {
        this.config = config
    }
    
    async sendResponse(report: RecursiveOperationResponse, context: ServerCallContext): Promise<Empty> {
        const remoteNodeId = getNodeIdFromPeerDescriptor((context as DhtCallContext).incomingSourceDescriptor!)
        logger.trace('RecursiveOperationResponse arrived: ' + JSON.stringify(report))
        this.config.onResponseReceived(remoteNodeId, report.routingPath, report.closestConnectedNodes, report.dataEntries, report.noCloserNodesFound)
        return {}
    }
}

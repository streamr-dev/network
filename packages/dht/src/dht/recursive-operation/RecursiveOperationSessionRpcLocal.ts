import { IRecursiveOperationSessionRpc } from '../../proto/packages/dht/protos/DhtRpc.server'
import { Empty } from '../../proto/google/protobuf/empty'
import { DataEntry, RecursiveOperationResponse, PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import { Logger } from '@streamr/utils'

const logger = new Logger(module)

interface RecursiveOperationSessionRpcLocalConfig {
    onResponseReceived: (routingPath: PeerDescriptor[], nodes: PeerDescriptor[], dataEntries: DataEntry[], noCloserNodesFound: boolean) => void
}

export class RecursiveOperationSessionRpcLocal implements IRecursiveOperationSessionRpc {

    private readonly config: RecursiveOperationSessionRpcLocalConfig

    constructor(config: RecursiveOperationSessionRpcLocalConfig) {
        this.config = config
    }
    
    async sendResponse(report: RecursiveOperationResponse): Promise<Empty> {
        logger.trace('RecursiveOperationResponse arrived: ' + JSON.stringify(report))
        this.config.onResponseReceived(report.routingPath, report.closestConnectedPeers, report.dataEntries, report.noCloserNodesFound)
        return {}
    }
}

import { IFindSessionRpc } from '../../proto/packages/dht/protos/DhtRpc.server'
import { Empty } from '../../proto/google/protobuf/empty'
import { DataEntry, FindResponse, PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import { Logger } from '@streamr/utils'

const logger = new Logger(module)

interface FindSessionRpcLocalConfig {
    doSendFindResponse: (routingPath: PeerDescriptor[], nodes: PeerDescriptor[], dataEntries: DataEntry[], noCloserNodesFound: boolean) => void
}

export class FindSessionRpcLocal implements IFindSessionRpc {

    private readonly config: FindSessionRpcLocalConfig

    constructor(config: FindSessionRpcLocalConfig) {
        this.config = config
    }
    
    async sendFindResponse(report: FindResponse): Promise<Empty> {
        logger.trace('FindResponse arrived: ' + JSON.stringify(report))
        this.config.doSendFindResponse(report.routingPath, report.closestConnectedPeers, report.dataEntries, report.noCloserNodesFound)
        return {}
    }
}

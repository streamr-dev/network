import { IRecursiveOperationSessionRpc } from '../../../generated/packages/dht/protos/DhtRpc.server'
import { Empty } from '../../../generated/google/protobuf/empty'
import { DataEntry, RecursiveOperationResponse, PeerDescriptor } from '../../../generated/packages/dht/protos/DhtRpc'
import { Logger } from '@streamr/utils'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { DhtCallContext } from '../../rpc-protocol/DhtCallContext'
import { DhtAddress, toNodeId } from '../../identifiers'

const logger = new Logger(module)

interface RecursiveOperationSessionRpcLocalOptions {
    onResponseReceived: (
        remoteNodeId: DhtAddress,
        routingPath: PeerDescriptor[],
        nodes: PeerDescriptor[],
        dataEntries: DataEntry[],
        noCloserNodesFound: boolean
    ) => void
}

export class RecursiveOperationSessionRpcLocal implements IRecursiveOperationSessionRpc {
    private readonly options: RecursiveOperationSessionRpcLocalOptions

    constructor(options: RecursiveOperationSessionRpcLocalOptions) {
        this.options = options
    }

    async sendResponse(report: RecursiveOperationResponse, context: ServerCallContext): Promise<Empty> {
        const remoteNodeId = toNodeId((context as DhtCallContext).incomingSourceDescriptor!)
        logger.trace('RecursiveOperationResponse arrived: ' + JSON.stringify(report))
        this.options.onResponseReceived(
            remoteNodeId,
            report.routingPath,
            report.closestConnectedNodes,
            report.dataEntries,
            report.noCloserNodesFound
        )
        return {}
    }
}

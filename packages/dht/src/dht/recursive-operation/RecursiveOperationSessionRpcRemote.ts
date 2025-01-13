import { Logger } from '@streamr/utils'
import { DataEntry, PeerDescriptor, RecursiveOperationResponse } from '../../../generated/packages/dht/protos/DhtRpc'
import { RecursiveOperationSessionRpcClient } from '../../../generated/packages/dht/protos/DhtRpc.client'
import { RpcRemote } from '../contact/RpcRemote'

const logger = new Logger(module)

export class RecursiveOperationSessionRpcRemote extends RpcRemote<RecursiveOperationSessionRpcClient> {
    sendResponse(
        routingPath: PeerDescriptor[],
        closestConnectedNodes: PeerDescriptor[],
        dataEntries: DataEntry[],
        noCloserNodesFound: boolean
    ): void {
        const report: RecursiveOperationResponse = {
            routingPath,
            closestConnectedNodes,
            dataEntries,
            noCloserNodesFound
        }
        this.getClient()
            .sendResponse(report, this.formDhtRpcOptions())
            .catch((_e) => {
                logger.trace('Failed to send RecursiveOperationResponse')
            })
    }
}

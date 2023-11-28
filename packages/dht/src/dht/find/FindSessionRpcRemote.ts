import {
    DataEntry,
    PeerDescriptor,
    RecursiveOperationResponse
} from '../../proto/packages/dht/protos/DhtRpc'
import { IFindSessionRpcClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { Logger } from '@streamr/utils'
import { RpcRemote } from '../contact/RpcRemote'

const logger = new Logger(module)

export class FindSessionRpcRemote extends RpcRemote<IFindSessionRpcClient> {

    sendResponse(
        routingPath: PeerDescriptor[],
        closestNodes: PeerDescriptor[],
        dataEntries: DataEntry[],
        noCloserNodesFound: boolean
    ): void {
        const report: RecursiveOperationResponse = {
            routingPath,
            closestConnectedPeers: closestNodes,
            dataEntries,
            noCloserNodesFound
        }
        this.getClient().sendResponse(report, this.formDhtRpcOptions()).catch((_e) => {
            logger.trace('Failed to send RecursiveOperationResponse')
        })
    }
}

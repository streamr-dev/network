import {
    DataEntry,
    PeerDescriptor,
    FindResponse
} from '../../proto/packages/dht/protos/DhtRpc'
import { IFindSessionRpcClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { Logger } from '@streamr/utils'
import { Remote } from '../contact/Remote'

const logger = new Logger(module)

export class FindSessionRpcRemote extends Remote<IFindSessionRpcClient> {

    sendFindResponse(
        routingPath: PeerDescriptor[],
        closestNodes: PeerDescriptor[],
        dataEntries: DataEntry[],
        noCloserNodesFound: boolean
    ): void {
        const report: FindResponse = {
            routingPath,
            closestConnectedPeers: closestNodes,
            dataEntries,
            noCloserNodesFound
        }
        this.getClient().sendFindResponse(report, this.formDhtRpcOptions()).catch((_e) => {
            logger.trace('Failed to send FindResult')
        })
    }
}

import {
    DataEntry,
    PeerDescriptor,
    RecursiveFindReport
} from '../../proto/packages/dht/protos/DhtRpc'
import { IRecursiveFindSessionServiceClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { DhtRpcOptions } from '../../rpc-protocol/DhtRpcOptions'
import { Logger } from '@streamr/utils'
import { Remote } from '../contact/Remote'

const logger = new Logger(module)

export class RemoteRecursiveFindSession extends Remote<IRecursiveFindSessionServiceClient> {

    reportRecursiveFindResult(routingPath: PeerDescriptor[], closestNodes: PeerDescriptor[], 
        dataEntries: DataEntry[], noCloserNodesFound: boolean): void {
        
        const report: RecursiveFindReport = {
            routingPath,
            nodes: closestNodes,
            dataEntries: dataEntries,
            noCloserNodesFound: noCloserNodesFound
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: this.ownPeerDescriptor,
            targetDescriptor: this.peerDescriptor
        }

        this.client.reportRecursiveFindResult(report, options).catch((_e) => {
            logger.trace('Failed to send RecursiveFindResult')
        })
    }
}

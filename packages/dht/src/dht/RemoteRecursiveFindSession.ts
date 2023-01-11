import {
    PeerDescriptor,
    RecursiveFindReport
} from '../proto/packages/dht/protos/DhtRpc'
import { IRecursiveFindSessionServiceClient, RecursiveFindSessionServiceClient } from '../proto/packages/dht/protos/DhtRpc.client'
import { DhtRpcOptions } from '../rpc-protocol/DhtRpcOptions'
import { Logger } from '@streamr/utils'
import { ProtoRpcClient, RpcCommunicator, toProtoRpcClient } from '@streamr/proto-rpc'
import { ITransport } from '../transport/ITransport'
import { ListeningRpcCommunicator } from '../exports'

const logger = new Logger(module)

export class RemoteRecursiveFindSession {

    private rpcCommunicator: RpcCommunicator
    private client: ProtoRpcClient<IRecursiveFindSessionServiceClient>

    constructor(private ownPeerDescriptor: PeerDescriptor,
        private targetPeerDescriptor: PeerDescriptor,
        serviceId: string,
        rpcTransport: ITransport
    ) {

        this.rpcCommunicator = new ListeningRpcCommunicator(serviceId, rpcTransport, { rpcRequestTimeout: 15000 })
        this.client = toProtoRpcClient(new RecursiveFindSessionServiceClient(this.rpcCommunicator.getRpcClientTransport()))
    }

    reportRecursiveFindResult(closestNodes: PeerDescriptor[], noCloserNodesFound: boolean): void {
        const report: RecursiveFindReport = {
            nodes: closestNodes,
            noCloserNodesFound: noCloserNodesFound
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: this.ownPeerDescriptor,
            targetDescriptor: this.targetPeerDescriptor
        }

        this.client.reportRecursiveFindResult(report, options).catch((_e) => {
            logger.trace('Failed to send RecursiveFindResult rtcOffer')
        })
    }
}

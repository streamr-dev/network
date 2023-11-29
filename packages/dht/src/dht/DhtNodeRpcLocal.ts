import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { Logger } from '@streamr/utils'
import KBucket from 'k-bucket'
import { getNodeIdFromPeerDescriptor } from '../helpers/peerIdFromPeerDescriptor'
import { Empty } from '../proto/google/protobuf/empty'
import {
    ClosestPeersRequest,
    ClosestPeersResponse,
    LeaveNotice,
    PeerDescriptor,
    PingRequest,
    PingResponse
} from '../proto/packages/dht/protos/DhtRpc'
import { IDhtNodeRpc } from '../proto/packages/dht/protos/DhtRpc.server'
import { DhtCallContext } from '../rpc-protocol/DhtCallContext'
import { DhtNodeRpcRemote } from './DhtNodeRpcRemote'

interface DhtNodeRpcLocalConfig {
    bucket: KBucket<DhtNodeRpcRemote>
    serviceId: string
    peerDiscoveryQueryBatchSize: number
    addNewContact: (contact: PeerDescriptor) => void
    removeContact: (contact: PeerDescriptor) => void
}

const logger = new Logger(module)

export class DhtNodeRpcLocal implements IDhtNodeRpc {

    private readonly config: DhtNodeRpcLocalConfig

    constructor(config: DhtNodeRpcLocalConfig) {
        this.config = config
    }

    async getClosestPeers(request: ClosestPeersRequest, context: ServerCallContext): Promise<ClosestPeersResponse> {
        this.config.addNewContact((context as DhtCallContext).incomingSourceDescriptor!)
        const response = {
            peers: this.getClosestPeerDescriptors(request.nodeId, this.config.peerDiscoveryQueryBatchSize),
            requestId: request.requestId
        }
        return response
    }

    private getClosestPeerDescriptors(nodeId: Uint8Array, limit: number): PeerDescriptor[] {
        const closestPeers = this.config.bucket.closest(nodeId, limit)
        return closestPeers.map((rpcRemote: DhtNodeRpcRemote) => rpcRemote.getPeerDescriptor())
    }

    async ping(request: PingRequest, context: ServerCallContext): Promise<PingResponse> {
        logger.trace('received ping request: ' + getNodeIdFromPeerDescriptor((context as DhtCallContext).incomingSourceDescriptor!))
        setImmediate(() => {
            this.config.addNewContact((context as DhtCallContext).incomingSourceDescriptor!)
        })
        const response: PingResponse = {
            requestId: request.requestId
        }
        return response
    }

    async leaveNotice(_request: LeaveNotice, context: ServerCallContext): Promise<Empty> {
        // TODO check signature??
        const sender = (context as DhtCallContext).incomingSourceDescriptor!
        logger.trace('received leave notice: ' + getNodeIdFromPeerDescriptor(sender))
        this.config.removeContact(sender)
        return {}
    }
}

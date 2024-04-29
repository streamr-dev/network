import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { Logger } from '@streamr/utils'
import { DhtAddress, getDhtAddressFromRaw, getNodeIdFromPeerDescriptor } from '../identifiers'
import { Empty } from '../proto/google/protobuf/empty'
import {
    ClosestPeersRequest,
    ClosestPeersResponse,
    ClosestRingPeersRequest,
    ClosestRingPeersResponse,
    PeerDescriptor,
    PingRequest,
    PingResponse
} from '../proto/packages/dht/protos/DhtRpc'
import { IDhtNodeRpc } from '../proto/packages/dht/protos/DhtRpc.server'
import { DhtCallContext } from '../rpc-protocol/DhtCallContext'
import { RingContacts } from './contact/RingContactList'
import { getClosestNodes } from './contact/getClosestNodes'
import { RingIdRaw } from './contact/ringIdentifiers'

interface DhtNodeRpcLocalConfig {
    peerDiscoveryQueryBatchSize: number
    getNeighbors: () => ReadonlyArray<PeerDescriptor>
    getClosestRingContactsTo: (id: RingIdRaw, limit: number) => RingContacts
    addContact: (contact: PeerDescriptor) => void
    removeContact: (nodeId: DhtAddress) => void
}

const logger = new Logger(module)

export class DhtNodeRpcLocal implements IDhtNodeRpc {

    private readonly config: DhtNodeRpcLocalConfig

    constructor(config: DhtNodeRpcLocalConfig) {
        this.config = config
    }

    // TODO rename to getClosestNeighbors (breaking change)
    async getClosestPeers(request: ClosestPeersRequest, context: ServerCallContext): Promise<ClosestPeersResponse> {
        this.config.addContact((context as DhtCallContext).incomingSourceDescriptor!)
        const peers = getClosestNodes(
            getDhtAddressFromRaw(request.nodeId), 
            this.config.getNeighbors(),
            { maxCount: this.config.peerDiscoveryQueryBatchSize }
        )
        const response = {
            peers,
            requestId: request.requestId
        }
        return response
    }

    // TODO rename to getClosestRingContacts (breaking change)
    async getClosestRingPeers(request: ClosestRingPeersRequest, context: ServerCallContext): Promise<ClosestRingPeersResponse> {
        this.config.addContact((context as DhtCallContext).incomingSourceDescriptor!)
        const closestContacts = this.config.getClosestRingContactsTo(request.ringId as RingIdRaw, this.config.peerDiscoveryQueryBatchSize)
        const response = {
            leftPeers: closestContacts.left,
            rightPeers: closestContacts.right,
            requestId: request.requestId
        }
        return response
    }

    async ping(request: PingRequest, context: ServerCallContext): Promise<PingResponse> {
        logger.trace('received ping request: ' + getNodeIdFromPeerDescriptor((context as DhtCallContext).incomingSourceDescriptor!))
        setImmediate(() => {
            this.config.addContact((context as DhtCallContext).incomingSourceDescriptor!)
        })
        const response: PingResponse = {
            requestId: request.requestId
        }
        return response
    }

    async leaveNotice(context: ServerCallContext): Promise<Empty> {
        // TODO check signature??
        const sender = (context as DhtCallContext).incomingSourceDescriptor!
        const senderNodeId = getNodeIdFromPeerDescriptor(sender)
        logger.trace('received leave notice: ' + senderNodeId)
        this.config.removeContact(senderNodeId)
        return {}
    }
}

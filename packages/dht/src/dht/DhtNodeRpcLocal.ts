import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { Logger } from '@streamr/utils'
import { DhtAddress, toDhtAddress, toNodeId } from '../identifiers'
import { Empty } from '../../generated/google/protobuf/empty'
import {
    ClosestPeersRequest,
    ClosestPeersResponse,
    ClosestRingPeersRequest,
    ClosestRingPeersResponse,
    PeerDescriptor,
    PingRequest,
    PingResponse
} from '../../generated/packages/dht/protos/DhtRpc'
import { IDhtNodeRpc } from '../../generated/packages/dht/protos/DhtRpc.server'
import { DhtCallContext } from '../rpc-protocol/DhtCallContext'
import { RingContacts } from './contact/RingContactList'
import { getClosestNodes } from './contact/getClosestNodes'
import { RingIdRaw } from './contact/ringIdentifiers'

interface DhtNodeRpcLocalOptions {
    peerDiscoveryQueryBatchSize: number
    getNeighbors: () => readonly PeerDescriptor[]
    getClosestRingContactsTo: (id: RingIdRaw, limit: number) => RingContacts
    addContact: (contact: PeerDescriptor) => void
    removeContact: (nodeId: DhtAddress) => void
}

const logger = new Logger(module)

export class DhtNodeRpcLocal implements IDhtNodeRpc {
    private readonly options: DhtNodeRpcLocalOptions

    constructor(options: DhtNodeRpcLocalOptions) {
        this.options = options
    }

    // TODO rename to getClosestNeighbors (breaking change)
    async getClosestPeers(request: ClosestPeersRequest, context: ServerCallContext): Promise<ClosestPeersResponse> {
        this.options.addContact((context as DhtCallContext).incomingSourceDescriptor!)
        const peers = getClosestNodes(toDhtAddress(request.nodeId), this.options.getNeighbors(), {
            maxCount: this.options.peerDiscoveryQueryBatchSize
        })
        const response = {
            peers,
            requestId: request.requestId
        }
        return response
    }

    // TODO rename to getClosestRingContacts (breaking change)
    async getClosestRingPeers(
        request: ClosestRingPeersRequest,
        context: ServerCallContext
    ): Promise<ClosestRingPeersResponse> {
        this.options.addContact((context as DhtCallContext).incomingSourceDescriptor!)
        const closestContacts = this.options.getClosestRingContactsTo(
            request.ringId as RingIdRaw,
            this.options.peerDiscoveryQueryBatchSize
        )
        const response = {
            leftPeers: closestContacts.left,
            rightPeers: closestContacts.right,
            requestId: request.requestId
        }
        return response
    }

    async ping(request: PingRequest, context: ServerCallContext): Promise<PingResponse> {
        logger.trace('received ping request: ' + toNodeId((context as DhtCallContext).incomingSourceDescriptor!))
        setImmediate(() => {
            this.options.addContact((context as DhtCallContext).incomingSourceDescriptor!)
        })
        const response: PingResponse = {
            requestId: request.requestId
        }
        return response
    }

    async leaveNotice(context: ServerCallContext): Promise<Empty> {
        // TODO check signature??
        const sender = (context as DhtCallContext).incomingSourceDescriptor!
        const senderNodeId = toNodeId(sender)
        logger.trace('received leave notice: ' + senderNodeId)
        this.options.removeContact(senderNodeId)
        return {}
    }
}

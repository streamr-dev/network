import { IDhtRpcServiceClient } from '../proto/DhtRpc.client'
import { ClosestPeersRequest, PeerDescriptor, PingRequest, RouteMessageWrapper } from '../proto/DhtRpc'
import { v4 } from 'uuid'
import { PeerID } from '../helpers/PeerID'
import { DhtRpcOptions } from '../rpc-protocol/DhtRpcOptions'
import { Logger } from '@streamr/utils'
import { ProtoRpcClient } from '@streamr/proto-rpc'

const logger = new Logger(module)

// Fields required by objects stored in the k-bucket library
interface KBucketContact {
    id: Uint8Array
    vectorClock: number
}

export interface RouteMessageParams {
    message: Uint8Array
    destinationPeer: PeerDescriptor
    sourcePeer: PeerDescriptor
    serviceId: string
    previousPeer?: PeerDescriptor
    messageId?: string
    reachableThrough?: PeerDescriptor[]
}

export class DhtPeer implements KBucketContact {
    private static counter = 0
    
    public readonly peerId: PeerID

    public get id(): Uint8Array {
        return this.peerId.value
    }

    private peerDescriptor: PeerDescriptor
    public vectorClock: number
    private readonly dhtClient: ProtoRpcClient<IDhtRpcServiceClient>
    
    constructor(peerDescriptor: PeerDescriptor, client: ProtoRpcClient<IDhtRpcServiceClient>) {
        this.peerId = PeerID.fromValue(peerDescriptor.peerId)
        this.peerDescriptor = peerDescriptor
        this.vectorClock = DhtPeer.counter++
        this.dhtClient = client
        this.getClosestPeers = this.getClosestPeers.bind(this)
        this.ping = this.ping.bind(this)
    }

    async getClosestPeers(sourceDescriptor: PeerDescriptor): Promise<PeerDescriptor[]> {
        const request: ClosestPeersRequest = {
            peerDescriptor: sourceDescriptor,
            requestId: v4()
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: sourceDescriptor as PeerDescriptor,
            targetDescriptor: this.peerDescriptor as PeerDescriptor
        }

        try {
            const peers = await this.dhtClient.getClosestPeers(request, options)
            return peers.peers
        } catch (err) {
            logger.debug(err)
            // logger.warn(PeerID.fromValue(sourceDescriptor.peerId).toKey() + ", " +  PeerID.fromValue(this.peerDescriptor.peerId).toKey())
            return []
        }
    }

    async ping(sourceDescriptor: PeerDescriptor): Promise<boolean> {
        const request: PingRequest = {
            requestId: v4()
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: sourceDescriptor as PeerDescriptor,
            targetDescriptor: this.peerDescriptor as PeerDescriptor
        }
        try {
            const pong = await this.dhtClient.ping(request, options)
            if (pong.requestId === request.requestId) {
                return true
            }
        } catch (err) {
            logger.debug(err)
        }
        return false
    }

    async routeMessage(params: RouteMessageWrapper): Promise<boolean> {
        const message: RouteMessageWrapper = {
            destinationPeer: params.destinationPeer,
            sourcePeer: params.sourcePeer,
            previousPeer: params.previousPeer,
            message: params.message,
            requestId: params.requestId || v4(),
            reachableThrough: params.reachableThrough || []
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: params.previousPeer as PeerDescriptor,
            targetDescriptor: this.peerDescriptor as PeerDescriptor,
            timeout: 10000
        }
        try {
            const ack = await this.dhtClient.routeMessage(message, options)
            if (ack.error!.length > 0) {
                return false
            }
        } catch (err) {
            const fromNode = params.previousPeer ?
                PeerID.fromValue(params.previousPeer!.peerId).toKey() : PeerID.fromValue(params.sourcePeer!.peerId).toKey()

            logger.debug(
                `Failed to send routeMessage from ${fromNode} to ${this.peerId.toKey()} with: ${err}`
            )
            return false
        }
        return true
    }

    async forwardMessage(params: RouteMessageWrapper): Promise<boolean> {
        const message: RouteMessageWrapper = {
            destinationPeer: params.destinationPeer,
            sourcePeer: params.sourcePeer,
            previousPeer: params.previousPeer,
            message: params.message,
            requestId: params.requestId || v4(),
            reachableThrough: params.reachableThrough || []
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: params.previousPeer as PeerDescriptor,
            targetDescriptor: this.peerDescriptor as PeerDescriptor,
            timeout: 10000
        }
        try {
            const ack = await this.dhtClient.forwardMessage(message, options)
            if (ack.error!.length > 0) {
                return false
            }
        } catch (err) {
            const fromNode = params.previousPeer ?
                PeerID.fromValue(params.previousPeer!.peerId).toKey() : PeerID.fromValue(params.sourcePeer!.peerId).toKey()

            logger.debug(
                `Failed to send forwardMessage from ${fromNode} to ${this.peerId.toKey()} with: ${err}`
            )
            return false
        }
        return true
    }

    getPeerDescriptor(): PeerDescriptor {
        return this.peerDescriptor
    }
}

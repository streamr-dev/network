import { IDhtRpcServiceClient } from '../proto/packages/dht/protos/DhtRpc.client'
import { ClosestPeersRequest, LeaveNotice, MigrateDataRequest, MigrateDataResponse, PeerDescriptor, PingRequest, 
    RouteMessageWrapper, StoreDataRequest, StoreDataResponse } from '../proto/packages/dht/protos/DhtRpc'
import { v4 } from 'uuid'
import { PeerID } from '../helpers/PeerID'
import { DhtRpcOptions } from '../rpc-protocol/DhtRpcOptions'
import { Logger } from '@streamr/utils'
import { ProtoRpcClient } from '@streamr/proto-rpc'
import { DhtNode } from './DhtNode'
import {
    isSamePeerDescriptor,
    keyFromPeerDescriptor,
    peerIdFromPeerDescriptor
} from '../helpers/peerIdFromPeerDescriptor'

const logger = new Logger(module)

// Fields required by objects stored in the k-bucket library
export interface KBucketContact {
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
    private readonly serviceId: string
    private readonly ownPeerDescriptor: PeerDescriptor
    private dhtNode?: DhtNode

    constructor(ownPeerDescriptor: PeerDescriptor,
        peerDescriptor: PeerDescriptor,
        client: ProtoRpcClient<IDhtRpcServiceClient>,
        serviceId: string,
        dhtNode?: DhtNode
    ) {
        this.ownPeerDescriptor = ownPeerDescriptor
        this.peerId = peerIdFromPeerDescriptor(peerDescriptor)
        this.peerDescriptor = peerDescriptor
        this.vectorClock = DhtPeer.counter++
        this.dhtClient = client
        this.serviceId = serviceId
        this.dhtNode = dhtNode
        this.getClosestPeers = this.getClosestPeers.bind(this)
        this.ping = this.ping.bind(this)
    }

    async getClosestPeers(kademliaId: Uint8Array): Promise<PeerDescriptor[]> {
        logger.trace(`Requesting getClosestPeers on ${this.serviceId} from ${this.peerId.toKey()}`)
        const request: ClosestPeersRequest = {
            kademliaId: kademliaId,
            requestId: v4()
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: this.ownPeerDescriptor,
            targetDescriptor: this.peerDescriptor
        }

        try {
            const peers = await this.dhtClient.getClosestPeers(request, options)
            return peers.peers
        } catch (err) {
            logger.debug(`failed getClosestPeers request: ${request.requestId}`)
            throw err
        }

    }

    async ping(): Promise<boolean> {
        logger.trace(`Requesting ping on ${this.serviceId} from ${this.peerId.toKey()}`)
        const request: PingRequest = {
            requestId: v4()
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: this.ownPeerDescriptor,
            targetDescriptor: this.peerDescriptor,
            timeout: 10000
        }
        try {
            const pong = await this.dhtClient.ping(request, options)
            if (pong.requestId === request.requestId) {
                return true
            }
        } catch (err) {
            logger.debug(`ping failed on ${this.serviceId} to ${this.peerId.toKey()}: ${err}`)
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
            reachableThrough: params.reachableThrough || [],
            routingPath: params.routingPath
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: params.previousPeer as PeerDescriptor,
            targetDescriptor: this.peerDescriptor as PeerDescriptor,
            timeout: 10000
        }
        try {
            logger.trace('calling dhtClient.routeMessage')
            const ack = await this.dhtClient.routeMessage(message, options)
            logger.trace('dhtClient.routeMessage returned')

            // Success signal if sent to destination and error includes duplicate
            if (
                isSamePeerDescriptor(params.destinationPeer!, this.peerDescriptor)
                && ack.error.includes('duplicate')
            ) {
                return true
            } else if (ack.error!.length > 0) {
                return false
            }
        } catch (err) {
            const fromNode = params.previousPeer ?
                peerIdFromPeerDescriptor(params.previousPeer) : keyFromPeerDescriptor(params.sourcePeer!)

            logger.debug(
                `Failed to send routeMessage from ${fromNode} to ${this.peerId.toKey()} with: ${err}`
            )
            return false
        }
        return true
    }

    async findRecursively(params: RouteMessageWrapper): Promise<boolean> {
        const message: RouteMessageWrapper = {
            destinationPeer: params.destinationPeer,
            sourcePeer: params.sourcePeer,
            previousPeer: params.previousPeer,
            message: params.message,
            requestId: params.requestId || v4(),
            reachableThrough: params.reachableThrough || [],
            routingPath: params.routingPath
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: params.previousPeer as PeerDescriptor,
            targetDescriptor: this.peerDescriptor as PeerDescriptor,
            timeout: 10000
        }
        try {
            const ack = await this.dhtClient.findRecursively(message, options)
            if (ack.error!.length > 0) {
                return false
            }
        } catch (err) {
            const fromNode = params.previousPeer ? keyFromPeerDescriptor(params.previousPeer) : keyFromPeerDescriptor(params.sourcePeer!)
            logger.debug(`Failed to send routeMessage from ${fromNode} to ${this.peerId.toKey()} with: ${err}`)
            return false
        }
        return true
    }

    async storeData(request: StoreDataRequest): Promise<StoreDataResponse> {
        
        const options: DhtRpcOptions = {
            sourceDescriptor: this.ownPeerDescriptor,
            targetDescriptor: this.peerDescriptor,
            timeout: 10000
        }
        try {
            const result = await this.dhtClient.storeData(request, options)
            return result
        } catch (err) {
            throw `Could not store data to ${keyFromPeerDescriptor(this.peerDescriptor)} from ${keyFromPeerDescriptor(this.ownPeerDescriptor)} ${err}`
        }

    }

    async migrateData(request: MigrateDataRequest, doNotConnect: boolean = false): Promise<MigrateDataResponse> {
        
        const options: DhtRpcOptions = {
            sourceDescriptor: this.ownPeerDescriptor,
            targetDescriptor: this.peerDescriptor,
            timeout: 10000,
            doNotConnect: doNotConnect
        }

        return this.dhtClient.migrateData(request, options)      
    }

    async forwardMessage(params: RouteMessageWrapper): Promise<boolean> {
        const message: RouteMessageWrapper = {
            destinationPeer: params.destinationPeer,
            sourcePeer: params.sourcePeer,
            previousPeer: params.previousPeer,
            message: params.message,
            requestId: params.requestId || v4(),
            reachableThrough: params.reachableThrough || [],
            routingPath: params.routingPath
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
                keyFromPeerDescriptor(params.previousPeer) : keyFromPeerDescriptor(params.sourcePeer!)

            logger.debug(
                `Failed to send forwardMessage from ${fromNode} to ${this.peerId.toKey()} with: ${err}`
            )
            return false
        }
        return true
    }

    leaveNotice(): void {
        logger.trace(`Sending leaveNotice on ${this.serviceId} from ${this.peerId.toKey()}`)
        const request: LeaveNotice = {
            serviceId: this.serviceId
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: this.ownPeerDescriptor,
            targetDescriptor: this.peerDescriptor,
            notification: true
        }
        this.dhtClient.leaveNotice(request, options).catch((e) => {
            logger.trace('Failed to send leaveNotice' + e)
        })
    }

    getPeerDescriptor(): PeerDescriptor {
        return this.peerDescriptor
    }
}

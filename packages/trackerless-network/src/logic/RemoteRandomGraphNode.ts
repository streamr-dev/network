import { INetworkRpcClient } from '../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { PeerDescriptor, UUID, PeerID, DhtRpcOptions } from '@streamr/dht'
import {
    StreamMessage,
    StreamHandshakeRequest,
    InterleaveNotice,
    LeaveStreamNotice,
    NeighborUpdate
} from '../proto/packages/trackerless-network/protos/NetworkRpc'
import { Logger } from '@streamr/utils'
import { ProtoRpcClient } from '@streamr/proto-rpc'

interface HandshakeResponse {
    accepted: boolean
    interleaveTarget?: PeerDescriptor
}

interface UpdateNeighborsResponse {
    peers: PeerDescriptor[]
    removeMe: boolean
}

const logger = new Logger(module)

export class RemoteRandomGraphNode {
    private remotePeerDescriptor: PeerDescriptor
    private client: ProtoRpcClient<INetworkRpcClient>
    private graphId: string
    private neighbors: PeerDescriptor[]
    constructor(peerDescriptor: PeerDescriptor, graphId: string, client: ProtoRpcClient<INetworkRpcClient>) {
        this.remotePeerDescriptor = peerDescriptor
        this.client = client
        this.graphId = graphId
        this.neighbors = []
    }

    async handshake(
        ownPeerDescriptor: PeerDescriptor,
        neighbors: string[],
        peerView: string[],
        concurrentHandshakeTargetId?: string,
        interleaving = false,
        interleavingFrom?: string
    ): Promise<HandshakeResponse> {

        const request: StreamHandshakeRequest = {
            randomGraphId: this.graphId,
            requestId: new UUID().toString(),
            senderId: PeerID.fromValue(ownPeerDescriptor.kademliaId).toKey(),
            neighbors,
            peerView,
            concurrentHandshakeTargetId,
            interleaving,
            interleavingFrom,
            senderDescriptor: ownPeerDescriptor
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: ownPeerDescriptor as PeerDescriptor,
            targetDescriptor: this.remotePeerDescriptor as PeerDescriptor
        }
        try {
            const response = await this.client.handshake(request, options)
            return {
                accepted: response.accepted,
                interleaveTarget: response.interleaveTarget
            }
        } catch (err: any) {
            logger.debug(`handshake to ${PeerID.fromValue(this.getPeerDescriptor().kademliaId).toKey()} failed: ${err}`)
            return {
                accepted: false
            }
        }
    }

    async sendData(ownPeerDescriptor: PeerDescriptor, msg: StreamMessage): Promise<void> {
        const options: DhtRpcOptions = {
            sourceDescriptor: ownPeerDescriptor as PeerDescriptor,
            targetDescriptor: this.remotePeerDescriptor as PeerDescriptor,
            notification: true
        }
        try {
            this.client.sendData(msg, options).catch(() => {
                logger.trace('Failed to sendData')
            })
        } catch (err: any) {
            logger.warn(err)
        }
    }

    interleaveNotice(ownPeerDescriptor: PeerDescriptor, originatorDescriptor: PeerDescriptor): void {
        const options: DhtRpcOptions = {
            sourceDescriptor: ownPeerDescriptor as PeerDescriptor,
            targetDescriptor: this.remotePeerDescriptor as PeerDescriptor,
            notification: true
        }
        const notification: InterleaveNotice = {
            randomGraphId: this.graphId,
            interleaveTarget: originatorDescriptor,
            senderId: PeerID.fromValue(ownPeerDescriptor.kademliaId).toKey()
        }
        this.client.interleaveNotice(notification, options).catch(() => {
            logger.warn('Failed to send interleaveNotice')
        })
    }

    leaveStreamNotice(ownPeerDescriptor: PeerDescriptor): void {
        const options: DhtRpcOptions = {
            sourceDescriptor: ownPeerDescriptor as PeerDescriptor,
            targetDescriptor: this.remotePeerDescriptor as PeerDescriptor,
            notification: true
        }
        const notification: LeaveStreamNotice = {
            senderId: PeerID.fromValue(ownPeerDescriptor.kademliaId).toKey(),
            randomGraphId: this.graphId
        }
        this.client.leaveStreamNotice(notification, options).catch(() => {
            logger.warn('Failed to send leaveStreamNotice')
        })
    }

    getPeerDescriptor(): PeerDescriptor {
        return this.remotePeerDescriptor
    }

    async updateNeighbors(ownPeerDescriptor: PeerDescriptor, neighbors: PeerDescriptor[]): Promise<UpdateNeighborsResponse> {
        const options: DhtRpcOptions = {
            sourceDescriptor: ownPeerDescriptor as PeerDescriptor,
            targetDescriptor: this.remotePeerDescriptor as PeerDescriptor,
        }
        const request: NeighborUpdate = {
            senderId: PeerID.fromValue(ownPeerDescriptor.kademliaId).toKey(),
            randomGraphId: this.graphId,
            neighborDescriptors: neighbors,
            removeMe: false
        }
        try {
            const response = await this.client.neighborUpdate(request, options)
            return {
                peers: response.neighborDescriptors!,
                removeMe: response.removeMe
            }
        } catch (err: any) {
            logger.debug(`updateNeighbors to ${PeerID.fromValue(this.getPeerDescriptor().kademliaId).toKey()} failed: ${err}`)
            return {
                peers: [],
                removeMe: true
            }
        }
    }

    setLocalNeighbors(neighbors: PeerDescriptor[]): void {
        this.neighbors = neighbors
    }

    getLocalNeighbors(): PeerDescriptor[] {
        return this.neighbors
    }
}

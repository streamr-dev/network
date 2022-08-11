import { INetworkRpcClient } from '../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { PeerDescriptor, UUID, PeerID } from '@streamr/dht'
import {
    DataMessage,
    HandshakeRequest,
    InterleaveNotice,
    LeaveNotice
} from '../proto/packages/trackerless-network/protos/NetworkRpc'
import { DhtRpcOptions } from '@streamr/dht/dist/src/rpc-protocol/DhtRpcOptions'

interface HandshakeResponse {
    accepted: boolean
    interleaveTarget?: PeerDescriptor
}

export class RemoteRandomGraphNode {
    private remotePeerDescriptor: PeerDescriptor
    private client: INetworkRpcClient
    private graphId: string
    constructor(peerDescriptor: PeerDescriptor, graphId: string, client: INetworkRpcClient) {
        this.remotePeerDescriptor = peerDescriptor
        this.client = client
        this.graphId = graphId
    }

    async handshake(
        ownPeerDescriptor: PeerDescriptor,
        neighbors: string[],
        peerView: string[],
        concurrentHandshakeTargetId?: string,
        interleaving = false
    ): Promise<HandshakeResponse> {

        const request: HandshakeRequest = {
            randomGraphId: this.graphId,
            requestId: new UUID().toString(),
            senderId: PeerID.fromValue(ownPeerDescriptor.peerId).toMapKey(),
            neighbors,
            peerView,
            concurrentHandshakeTargetId,
            interleaving,
            senderDescriptor: ownPeerDescriptor
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: ownPeerDescriptor as PeerDescriptor,
            targetDescriptor: this.remotePeerDescriptor as PeerDescriptor
        }
        try {
            const result = await this.client.handshake(request, options)
            const response = await result.response
            return {
                accepted: response.accepted,
                interleaveTarget: response.interleaveTarget
            }
        } catch (err) {
            console.error(err)
            return {
                accepted: false
            }
        }
    }

    async sendData(ownPeerDescriptor: PeerDescriptor, dataMessage: DataMessage): Promise<void> {
        const options: DhtRpcOptions = {
            sourceDescriptor: ownPeerDescriptor as PeerDescriptor,
            targetDescriptor: this.remotePeerDescriptor as PeerDescriptor,
            notification: true
        }
        try {
            await this.client.sendData(dataMessage, options)
        } catch (err) {
            console.error(err)
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
            senderId: PeerID.fromValue(ownPeerDescriptor.peerId).toMapKey()
        }
        this.client.interleaveNotice(notification, options)
    }

    leaveNotice(ownPeerDescriptor: PeerDescriptor): void {
        const options: DhtRpcOptions = {
            sourceDescriptor: ownPeerDescriptor as PeerDescriptor,
            targetDescriptor: this.remotePeerDescriptor as PeerDescriptor,
            notification: true
        }
        const notification: LeaveNotice = {
            senderId: PeerID.fromValue(ownPeerDescriptor.peerId).toMapKey(),
            randomGraphId: this.graphId
        }
        this.client.leaveNotice(notification, options)
    }

    getPeerDescriptor(): PeerDescriptor {
        return this.remotePeerDescriptor
    }
}

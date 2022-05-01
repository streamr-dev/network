import { DhtRpcClient } from '../proto/DhtRpc.client'
import { ClosestPeersRequest, PeerDescriptor, PingRequest } from '../proto/DhtRpc'
import { v4 } from 'uuid'
import { PeerID } from '../PeerID'
import { nodeFormatPeerDescriptor } from './helpers'
import { DhtRpcOptions } from '../transport/DhtTransportClient'

export class DhtPeer {
    private static counter = 0
    //public readonly id: PeerID
    
    private readonly peerId: PeerID

    public get id(): Uint8Array {
        return this.peerId.value
    }

    private lastContacted: number
    private peerDescriptor: PeerDescriptor
    public vectorClock: number
    private readonly dhtClient: DhtRpcClient
    constructor(peerDescriptor: PeerDescriptor, client: DhtRpcClient) {
        this.peerId = PeerID.fromValue(peerDescriptor.peerId)
        this.lastContacted = 0
        this.peerDescriptor = peerDescriptor
        this.vectorClock = DhtPeer.counter++
        this.dhtClient = client
        this.getClosestPeers = this.getClosestPeers.bind(this)
        this.ping = this.ping.bind(this)
    }

    async getClosestPeers(sourceDescriptor: PeerDescriptor): Promise<PeerDescriptor[]> {
        const request: ClosestPeersRequest = {
            peerDescriptor: sourceDescriptor,
            nonce: v4()
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: sourceDescriptor as PeerDescriptor,
            targetDescriptor: this.peerDescriptor as PeerDescriptor
        }

        const response = await this.dhtClient.getClosestPeers(request, options)
        const status = await response.status
        const peers = await response.response
        if (status.code !== 'OK') {
            return []
        }
        const formatted = peers.peers.map((peer) => nodeFormatPeerDescriptor(peer))
        return formatted
    }

    async ping(sourceDescriptor: PeerDescriptor): Promise<boolean> {
        const request: PingRequest = {
            nonce: v4()
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: sourceDescriptor as PeerDescriptor,
            targetDescriptor: this.peerDescriptor as PeerDescriptor
        }
        const response = await this.dhtClient.ping(request, options)
        const pong = await response.response
        if (pong.nonce === request.nonce) {
            return true
        }
        return false
    }

    getPeerId(): PeerID {
        return this.peerId
    }

    getPeerDscriptor(): PeerDescriptor {
        return this.peerDescriptor
    }

    // connect(): Promise<void> {
    //
    // }
}
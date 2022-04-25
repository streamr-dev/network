import { PeerID } from '../types'
import { DhtRpcClient } from '../proto/DhtRpc.client'
import { ClosestPeersRequest, PeerDescriptor } from '../proto/DhtRpc'
import { v4 } from 'uuid'
import { nodeFormatPeerDescriptor } from './helpers'
import { DhtRpcOptions } from '../transport/DhtTransportClient'

export class DhtPeer {
    private static counter = 0
    public readonly id: PeerID
    private lastContacted: number
    private peerDescriptor: PeerDescriptor
    public vectorClock: number
    private readonly dhtClient: DhtRpcClient
    constructor(peerDescriptor: PeerDescriptor, client: DhtRpcClient) {
        this.id = peerDescriptor.peerId
        this.lastContacted = 0
        this.peerDescriptor = peerDescriptor
        this.vectorClock = DhtPeer.counter++
        this.dhtClient = client
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

    getPeerId(): PeerID {
        return this.id
    }

    getPeerDscriptor(): PeerDescriptor {
        return this.peerDescriptor
    }

    // connect(): Promise<void> {
    //
    // }
}
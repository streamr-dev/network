import { PeerID } from '../types'
import { DhtRpcClient } from '../proto/DhtRpc.client'
import { PeerDescriptor } from '../proto/DhtRpc'
import { v4 } from 'uuid'

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

    async getClosestPeers(targetPeerDescriptor: PeerDescriptor): Promise<PeerDescriptor[]> {
        const response = await this.dhtClient.getClosestPeers(
            { peerDescriptor: this.peerDescriptor, nonce: v4() },
            {
                senderDescriptor: this.peerDescriptor,
                targetDescriptor: targetPeerDescriptor
            }
        )
        const status = await response.status
        const peers = await response.response
        if (status.code !== 'OK') {
            return []
        }
        return peers.peers
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
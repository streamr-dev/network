import { PeerID } from '../types'
import { DhtRpcClient } from '../proto/DhtRpc.client'
import { Neighbor } from '../proto/DhtRpc'
import { v4 } from 'uuid'

export class DhtPeer {
    private static counter = 0
    public readonly id: PeerID
    private lastContacted: number
    private peerDescriptor: any
    public vectorClock: number
    private readonly dhtClient: DhtRpcClient
    constructor(peerId: PeerID, client: DhtRpcClient) {
        this.id = peerId
        this.lastContacted = 0
        this.peerDescriptor = {}
        this.vectorClock = DhtPeer.counter++
        this.dhtClient = client
    }

    async getClosestPeers(peerId: PeerID): Promise<Neighbor[]> {
        const response = await this.dhtClient.getClosestPeers({peerId, nonce: v4()})
        const status = await response.status
        const neighbors = await response.response
        if (status.code !== 'OK') {
            return []
        }
        return neighbors.neighbors
    }

    getPeerId(): PeerID {
        return this.id
    }

    // connect(): Promise<void> {
    //
    // }
}
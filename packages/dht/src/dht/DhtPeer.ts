import { PeerID } from '../types'
import { DhtRpcClient } from '../proto/DhtRpc.client'
import { ClosestPeersRequest, PeerDescriptor } from '../proto/DhtRpc'
import { v4 } from 'uuid'
import { nodeFormatPeerDescriptor, stringFromId } from './helpers'

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

    async getClosestPeers(senderDescriptor: PeerDescriptor): Promise<PeerDescriptor[]> {
        const request: ClosestPeersRequest = {
            peerDescriptor: senderDescriptor,
            nonce: v4()
        }
        const response = await this.dhtClient.getClosestPeers(
            request,
            {
                senderDescriptor: senderDescriptor as PeerDescriptor,
                targetDescriptor: this.peerDescriptor as PeerDescriptor
            }
        )
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
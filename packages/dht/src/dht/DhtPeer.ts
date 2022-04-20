import { PeerID } from '../types'

export class DhtPeer {
    private readonly peerId: PeerID
    private lastContacted: number
    private peerDescriptor: any

    constructor(peerId: PeerID) {
        this.peerId = peerId
        this.lastContacted = 0
        this.peerDescriptor = {}
    }

    getClosestPeers(nodeId: PeerID): Promise<any> {

    }

    // connect(): Promise<void> {
    //
    // }
}
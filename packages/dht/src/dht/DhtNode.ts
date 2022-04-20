import { PeerID } from '../types'
import { DhtPeer } from './DhtPeer'

const ALPHA = 3

export class DhtNode {
    private readonly peers: Map<PeerID, DhtPeer>
    constructor() {
        this.peers = new Map()
    }

    joinDht(entrypoint: DhtPeer): Promise<void> {

    }

}
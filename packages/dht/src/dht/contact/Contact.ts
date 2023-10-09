import { PeerID } from '../../helpers/PeerID'
import { PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import { peerIdFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'

export class Contact {
    private peerDescriptor: PeerDescriptor

    constructor(peerDescriptor: PeerDescriptor) {
        this.peerDescriptor = peerDescriptor
    }

    public getPeerDescriptor(): PeerDescriptor {
        return this.peerDescriptor
    }

    public getPeerId(): PeerID {
        return peerIdFromPeerDescriptor(this.peerDescriptor)
    }
}

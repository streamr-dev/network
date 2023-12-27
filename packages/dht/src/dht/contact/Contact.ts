import { PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import { getNodeIdFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { DhtAddress } from '../../identifiers'

export class Contact {

    private peerDescriptor: PeerDescriptor

    constructor(peerDescriptor: PeerDescriptor) {
        this.peerDescriptor = peerDescriptor
    }

    public getPeerDescriptor(): PeerDescriptor {
        return this.peerDescriptor
    }

    public getNodeId(): DhtAddress {
        return getNodeIdFromPeerDescriptor(this.peerDescriptor)
    }
}

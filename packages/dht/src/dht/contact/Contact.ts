import { PeerDescriptor } from '../../../generated/packages/dht/protos/DhtRpc'
import { DhtAddress, toNodeId } from '../../identifiers'

export class Contact {
    private peerDescriptor: PeerDescriptor

    constructor(peerDescriptor: PeerDescriptor) {
        this.peerDescriptor = peerDescriptor
    }

    public getPeerDescriptor(): PeerDescriptor {
        return this.peerDescriptor
    }

    public getNodeId(): DhtAddress {
        return toNodeId(this.peerDescriptor)
    }
}

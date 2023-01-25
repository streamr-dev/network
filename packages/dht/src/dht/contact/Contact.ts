import { PeerID } from '../../helpers/PeerID'
import { PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'

export class ContactState<TContact> {
    public contacted = false
    public active = false
    constructor(public contact: TContact) {
    }
}

export interface IContact { peerId: PeerID, getPeerDescriptor: () => PeerDescriptor }

export interface Events {
    contactRemoved: (removedDescriptor: PeerDescriptor, closestDescriptors: PeerDescriptor[]) => void
    newContact: (newDescriptor: PeerDescriptor, closestDescriptors: PeerDescriptor[]) => void
}

export class Contact implements IContact {

    constructor(private peerDescriptor: PeerDescriptor) {
    }

    public getPeerDescriptor(): PeerDescriptor {
        return this.peerDescriptor
    }

    public get peerId(): PeerID {
        return PeerID.fromValue(this.peerDescriptor.kademliaId)
    }
}

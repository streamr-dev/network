import { PeerID } from '../../helpers/PeerID'
import { PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'

export class ContactState<TContact> {
    public contacted = false
    public active = false
    public contact: TContact

    constructor(contact: TContact) {
        this.contact = contact
    }
}

export interface IContact { peerId: PeerID, getPeerDescriptor: () => PeerDescriptor }

export interface Events {
    contactRemoved: (removedDescriptor: PeerDescriptor, closestDescriptors: PeerDescriptor[]) => void
    newContact: (newDescriptor: PeerDescriptor, closestDescriptors: PeerDescriptor[]) => void
}

export class Contact implements IContact {
    private peerDescriptor: PeerDescriptor

    constructor(peerDescriptor: PeerDescriptor) {
        this.peerDescriptor = peerDescriptor
    }

    public getPeerDescriptor(): PeerDescriptor {
        return this.peerDescriptor
    }

    public get peerId(): PeerID {
        return PeerID.fromValue(this.peerDescriptor.kademliaId)
    }
}

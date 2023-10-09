import { PeerID } from '../../helpers/PeerID'
import { PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import { peerIdFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'

export class ContactState<TContact> {
    public contacted = false
    public active = false
    public contact: TContact

    constructor(contact: TContact) {
        this.contact = contact
    }
}

export interface Events<C> {
    contactRemoved: (removedContact: C, closestContacts: C[]) => void
    newContact: (newContact: C, closestContacts: C[]) => void
}

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

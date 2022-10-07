import { PeerID } from '../../helpers/PeerID'
import { PeerDescriptor } from '../../proto/DhtRpc'

export class ContactState<Contact> {
    public contacted = false
    public active = false
    constructor(public contact: Contact) {
    }
}

export interface IContact { peerId: PeerID, getPeerDescriptor: () => PeerDescriptor }

export interface Events {
    contactRemoved: (removedDescriptor: PeerDescriptor, closestDescriptors: PeerDescriptor[]) => void
    newContact: (newDescriptor: PeerDescriptor, closestDescriptors: PeerDescriptor[]) => void
}

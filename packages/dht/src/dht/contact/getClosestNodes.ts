import { PeerDescriptor } from '../../../generated/packages/dht/protos/DhtRpc'
import { DhtAddress } from '../../identifiers'
import { Contact } from './Contact'
import { SortedContactList } from './SortedContactList'

export const getClosestNodes = (
    referenceId: DhtAddress,
    contacts: Iterable<PeerDescriptor>,
    opts?: {
        maxCount?: number
        excludedNodeIds?: Set<DhtAddress>
    }
): PeerDescriptor[] => {
    const list = new SortedContactList<Contact>({
        referenceId,
        allowToContainReferenceId: true,
        excludedNodeIds: opts?.excludedNodeIds,
        maxSize: opts?.maxCount
    })
    for (const contact of contacts) {
        list.addContact(new Contact(contact))
    }
    return list.getClosestContacts().map((n) => n.getPeerDescriptor())
}

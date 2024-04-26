import { DhtAddress } from '../../identifiers'
import { SortedContactList } from './SortedContactList'

// TODO remove this function and use getClosestNodes instead, and rename the file
export const getClosestContacts = <C extends { getNodeId: () => DhtAddress }>(
    referenceId: DhtAddress,
    contacts: Iterable<C>,
    opts?: {
        maxCount?: number
        excludedNodeIds?: Set<DhtAddress>
    }
): C[] => {
    const list = new SortedContactList<C>({
        referenceId,
        allowToContainReferenceId: true,
        excludedNodeIds: opts?.excludedNodeIds,
        maxSize: opts?.maxCount
    })
    for (const contact of contacts) {
        list.addContact(contact)
    }
    return list.getClosestContacts()
}

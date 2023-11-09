import KBucket from 'k-bucket'
import { PeerID } from '../../helpers/PeerID'
import { ContactList, ContactState } from './ContactList'

export class SortedContactList<C extends { getPeerId: () => PeerID }> extends ContactList<C> {

    private allowLocalPeerId: boolean
    private peerIdDistanceLimit?: PeerID
    private excludedPeerIDs?: PeerID[]

    constructor(
        ownId: PeerID,
        maxSize: number,
        defaultContactQueryLimit?: number,
        allowLocalPeerId = false,
        peerIdDistanceLimit?: PeerID,
        excludedPeerIDs?: PeerID[]
    ) {
        super(ownId, maxSize, defaultContactQueryLimit)
        this.compareIds = this.compareIds.bind(this)
        this.allowLocalPeerId = allowLocalPeerId
        this.peerIdDistanceLimit = peerIdDistanceLimit
        this.excludedPeerIDs = excludedPeerIDs
    }

    public getClosestContactId(): PeerID {
        return this.contactIds[0]
    }

    public getContactIds(): PeerID[] {
        return this.contactIds
    }

    public addContact(contact: C): void {
        if (this.excludedPeerIDs
            && this.excludedPeerIDs.some((peerId) => contact.getPeerId().equals(peerId))) {
            return
        }
        
        if ((!this.allowLocalPeerId && this.ownId.equals(contact.getPeerId())) ||
            (this.peerIdDistanceLimit !== undefined && this.compareIds(this.peerIdDistanceLimit, contact.getPeerId()) < 0)) {
            return
        }
        if (!this.contactsById.has(contact.getPeerId().toKey())) {
            if (this.contactIds.length < this.maxSize) {
                this.contactsById.set(contact.getPeerId().toKey(), new ContactState(contact))
                this.contactIds.push(contact.getPeerId())
                this.contactIds.sort(this.compareIds)
            } else if (this.compareIds(this.contactIds[this.maxSize - 1], contact.getPeerId()) > 0) {
                const removedId = this.contactIds.pop()
                const removedContact = this.contactsById.get(removedId!.toKey())!.contact
                this.contactsById.delete(removedId!.toKey())
                this.contactsById.set(contact.getPeerId().toKey(), new ContactState(contact))
                this.contactIds.push(contact.getPeerId())
                this.contactIds.sort(this.compareIds)
                this.emit(
                    'contactRemoved',
                    removedContact,
                    this.getClosestContacts()
                )
            }
            this.emit(
                'newContact',
                contact,
                this.getClosestContacts()
            )
        }
    }

    public addContacts(contacts: C[]): void {
        contacts.forEach((contact) => this.addContact(contact))
    }

    public setContacted(contactId: PeerID): void {
        if (this.contactsById.has(contactId.toKey())) {
            this.contactsById.get(contactId.toKey())!.contacted = true
        }
    }

    public setActive(contactId: PeerID): void {
        if (this.contactsById.has(contactId.toKey())) {
            this.contactsById.get(contactId.toKey())!.active = true
        }
    }

    public getClosestContacts(limit = this.defaultContactQueryLimit): C[] {
        const ret: C[] = []
        this.contactIds.forEach((contactId) => {
            const contact = this.contactsById.get(contactId.toKey())
            if (contact) {
                ret.push(contact.contact)
            }
        })
        return ret.slice(0, limit)
    }

    public getUncontactedContacts(num: number): C[] {
        const ret: C[] = []
        for (const contactId of this.contactIds) {
            const contact = this.contactsById.get(contactId.toKey())
            if (contact && !contact.contacted) {
                ret.push(contact.contact)
                if (ret.length >= num) {
                    return ret
                }
            }
        }
        return ret
    }

    public getActiveContacts(limit?: number): C[] {
        const ret: C[] = []
        this.contactIds.forEach((contactId) => {
            const contact = this.contactsById.get(contactId.toKey())
            if (contact && contact.active) {
                ret.push(contact.contact)
            }
        })
        if (limit !== undefined) {
            return ret.slice(0, limit)
        } else {
            return ret
        }
    }

    public compareIds(id1: PeerID, id2: PeerID): number {
        const distance1 = KBucket.distance(this.ownId.value, id1.value)
        const distance2 = KBucket.distance(this.ownId.value, id2.value)
        return distance1 - distance2
    }

    public removeContact(id: PeerID): boolean {
        if (this.contactsById.has(id.toKey())) {
            const removed = this.contactsById.get(id.toKey())!.contact
            const index = this.contactIds.findIndex((element) => element.equals(id))
            this.contactIds.splice(index, 1)
            this.contactsById.delete(id.toKey())
            this.emit(
                'contactRemoved',
                removed,
                this.getClosestContacts()
            )
            return true
        }
        return false
    }

    public isActive(id: PeerID): boolean {
        return this.contactsById.has(id.toKey()) ? this.contactsById.get(id.toKey())!.active : false
    }

    public getAllContacts(): C[] {
        return this.contactIds.map((peerId) => this.contactsById.get(peerId.toKey())!.contact)
    }
}

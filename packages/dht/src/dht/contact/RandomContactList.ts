import { PeerDescriptor } from '../../proto/DhtRpc'
import { Events, IContact, ContactState } from './Contact'

import EventEmitter from 'eventemitter3'
import { PeerID, PeerIDKey } from '../../helpers/PeerID'
export class SortedContactList<Contact extends IContact> extends EventEmitter<Events> {
    private contactsById: Map<PeerIDKey, ContactState<Contact>> = new Map()
    private contactIds: PeerID[] = []

    constructor(private ownId: PeerID, private maxSize: number) {
        super()
        this.ownId = ownId
    }

    addContact(contact: IContact): void {
        if (this.ownId.equals(contact.peerId)) {
            return
        }
        if (!this.contactsById.has(contact.peerId.toKey())) {
            this.contactsById.set(contact.peerId.toKey(), new ContactState(contact))
            this.contactIds.push(contact.peerId)
        } else if (Math.random() < 0.20) {
            const toRemove = this.contactIds.shift()
            this.contactsById.delete(toRemove!.toKey())
            this.contactIds.push(contact.peerId)
            this.contactsById.set(contact.peerId.toKey(), new ContactState(contact))
            this.emit('contactRemoved',
                contact.getPeerDescriptor(),

        }
    }

    getClosest()

    addContacts(contacts: IContact[]): void {
        contacts.forEach((contact) => this.addContact(contact))
    }

    removeContact(id: PeerID): boolean {
        return true
    }

    public getSize(): number {
        return this.contactIds.length
    }

    public getContact(id: PeerID): ContactState<Contact> {
        return this.contactsById.get(id.toKey())!
    }
}

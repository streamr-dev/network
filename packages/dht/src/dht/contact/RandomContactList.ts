import { PeerDescriptor } from '../../proto/DhtRpc'
import { Events, IContact, ContactState } from './Contact'

import EventEmitter from 'eventemitter3'
import { PeerID, PeerIDKey } from '../../helpers/PeerID'
export class RandomContactList<Contact extends IContact> extends EventEmitter<Events> {
    private contactsById: Map<PeerIDKey, ContactState<Contact>> = new Map()
    private contactIds: PeerID[] = []

    constructor(private ownId: PeerID, private maxSize: number) {
        super()
        this.ownId = ownId
    }

    addContact(contact: Contact): void {
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
                this.getContacts().map((contact: Contact) => contact.getPeerDescriptor())
            )

        }
    }

    addContacts(contacts: Contact[]): void {
        contacts.forEach((contact) => this.addContact(contact))
    }

    removeContact(id: PeerID): boolean {
        if (this.contactsById.has(id.toKey())) {
            const removedDescriptor = this.contactsById.get(id.toKey())!.contact.getPeerDescriptor()
            const index = this.contactIds.indexOf(id)
            this.contactIds.splice(index, 1)
            this.contactsById.delete(id.toKey())
            this.emit('contactRemoved', removedDescriptor, this.getContacts().map((contact: Contact) => contact.getPeerDescriptor()))
            return true
        }
        return false
    }

    public getSize(): number {
        return this.contactIds.length
    }

    public getContact(id: PeerID): ContactState<Contact> {
        return this.contactsById.get(id.toKey())!
    }

    public getContacts(limit = this.maxSize) {
        const ret: Contact[] = []
        this.contactIds.forEach((contactId) => {
            const contact = this.contactsById.get(contactId.toKey())
            if (contact) {
                ret.push(contact.contact)
            }
        })
        return ret.splice(0, limit)
    }
}

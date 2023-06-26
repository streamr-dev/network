import { Events, IContact, ContactState } from './Contact'

import EventEmitter from 'eventemitter3'
import { PeerID, PeerIDKey } from '../../helpers/PeerID'
export class RandomContactList<Contact extends IContact> extends EventEmitter<Events> {
    private contactsById: Map<PeerIDKey, ContactState<Contact>> = new Map()
    private contactIds: PeerID[] = []
    private ownId: PeerID
    private maxSize: number
    private randomness = 0.20
    private getContactsLimit = 20

    constructor(
        ownId: PeerID,
        maxSize: number,
        randomness = 0.20,
        getContactsLimit = 20
    ) {
        super()
        this.ownId = ownId
        this.maxSize = maxSize
        this.randomness = randomness
        this.getContactsLimit = getContactsLimit
    }

    addContact(contact: Contact): void {
        if (this.ownId.equals(contact.getPeerId())) {
            return
        }
        if (!this.contactsById.has(contact.getPeerId().toKey())) {
            const roll = Math.random()
            if (roll < this.randomness) {
                if (this.getSize() === this.maxSize && this.getSize() > 0) {
                    const toRemove = this.contactIds[0]
                    this.removeContact(toRemove)
                }
                this.contactIds.push(contact.getPeerId())
                this.contactsById.set(contact.getPeerId().toKey(), new ContactState(contact))
                this.emit(
                    'newContact',
                    contact.getPeerDescriptor(),
                    this.getContacts().map((contact: Contact) => contact.getPeerDescriptor())
                )
            }
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

    public getContacts(limit = this.getContactsLimit): Contact[] {
        const ret: Contact[] = []
        this.contactIds.forEach((contactId) => {
            const contact = this.contactsById.get(contactId.toKey())
            if (contact) {
                ret.push(contact.contact)
            }
        })
        return ret.splice(0, limit)
    }

    public clear(): void {
        this.contactsById.clear()
        this.contactIds.splice(0, this.contactIds.length)
    }

    public stop(): void {
        this.removeAllListeners()
        this.clear()
    }
}

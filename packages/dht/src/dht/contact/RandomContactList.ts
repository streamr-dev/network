import { PeerID } from '../../helpers/PeerID'
import { ContactState } from './Contact'
import { ContactList } from './ContactList'

export class RandomContactList<C extends { getPeerId: () => PeerID }> extends ContactList<C> {

    private randomness: number

    constructor(
        ownId: PeerID,
        maxSize: number,
        randomness = 0.20,
        defaultContactQueryLimit?: number
    ) {
        super(ownId, maxSize, defaultContactQueryLimit)
        this.randomness = randomness
    }

    addContact(contact: C): void {
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
                    contact,
                    this.getContacts()
                )
            }
        }
    }

    addContacts(contacts: C[]): void {
        contacts.forEach((contact) => this.addContact(contact))
    }

    removeContact(id: PeerID): boolean {
        if (this.contactsById.has(id.toKey())) {
            const removed = this.contactsById.get(id.toKey())!.contact
            const index = this.contactIds.findIndex((element) => element.equals(id))
            this.contactIds.splice(index, 1)
            this.contactsById.delete(id.toKey())
            this.emit('contactRemoved', removed, this.getContacts())
            return true
        }
        return false
    }

    public getContacts(limit = this.defaultContactQueryLimit): C[] {
        const ret: C[] = []
        this.contactIds.forEach((contactId) => {
            const contact = this.contactsById.get(contactId.toKey())
            if (contact) {
                ret.push(contact.contact)
            }
        })
        return ret.slice(0, limit)
    }
}

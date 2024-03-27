import { DhtAddress } from '../../identifiers'
import { ContactList } from './ContactList'

export class RandomContactList<C extends { getNodeId: () => DhtAddress }> extends ContactList<C> {

    private randomness: number

    constructor(
        localNodeId: DhtAddress,
        maxSize: number,
        randomness = 0.20,
        defaultContactQueryLimit?: number
    ) {
        super(localNodeId, maxSize, defaultContactQueryLimit)
        this.randomness = randomness
    }

    addContact(contact: C): void {
        if (this.localNodeId === contact.getNodeId()) {
            return
        }
        if (!this.contactsById.has(contact.getNodeId())) {
            const roll = Math.random()
            if (roll < this.randomness) {
                if (this.getSize() === this.maxSize && this.getSize() > 0) {
                    const toRemove = this.contactIds[0]
                    this.removeContact(toRemove)
                }
                this.contactIds.push(contact.getNodeId())
                this.contactsById.set(contact.getNodeId(), contact)
                this.emit(
                    'contactAdded',
                    contact,
                    this.getContacts()
                )
            }
        }
    }

    removeContact(id: DhtAddress): boolean {
        if (this.contactsById.has(id)) {
            const removed = this.contactsById.get(id)!
            const index = this.contactIds.findIndex((nodeId) => (nodeId === id))
            this.contactIds.splice(index, 1)
            this.contactsById.delete(id)
            this.emit('contactRemoved', removed, this.getContacts())
            return true
        }
        return false
    }

    public getContacts(limit = this.defaultContactQueryLimit): C[] {
        return this.contactIds.map((contactId) => this.contactsById.get(contactId)!).slice(0, limit)
    }
}

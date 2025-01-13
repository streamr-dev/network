import { DhtAddress } from '../../identifiers'
import { ContactList } from './ContactList'

export class RandomContactList<C extends { getNodeId: () => DhtAddress }> extends ContactList<C> {
    private randomness: number

    constructor(localNodeId: DhtAddress, maxSize: number, randomness = 0.2) {
        super(localNodeId, maxSize)
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
                this.emit('contactAdded', contact)
            }
        }
    }

    removeContact(id: DhtAddress): boolean {
        if (this.contactsById.has(id)) {
            const removed = this.contactsById.get(id)!
            const index = this.contactIds.findIndex((nodeId) => nodeId === id)
            this.contactIds.splice(index, 1)
            this.contactsById.delete(id)
            this.emit('contactRemoved', removed)
            return true
        }
        return false
    }

    public getContacts(limit?: number): C[] {
        const items = limit === undefined ? this.contactIds : this.contactIds.slice(0, Math.max(limit, 0))
        return items.map((contactId) => this.contactsById.get(contactId)!)
    }
}

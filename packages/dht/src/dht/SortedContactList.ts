import KBucket from 'k-bucket'
import { DhtPeer } from './DhtPeer'

class ContactWrapper {
    public contacted = false
    public active = false
    constructor(public contact: DhtPeer) {
    }
}

export class SortedContactList {
    private ownId: Uint8Array
    private contactsById: { [id: string]: ContactWrapper } = {}
    private contactIds: Uint8Array[] = []

    constructor(ownId: Uint8Array,
        contacts: DhtPeer[]) {

        this.compareIds = this.compareIds.bind(this)
        this.ownId = ownId
        contacts.forEach( (contact) => this.addContact(contact))
    }

    public getClosestContactId(): Uint8Array {
        return this.contactIds[0]
    }

    public getContactIds(): Uint8Array[] {
        return this.contactIds
    }

    public addContact(contact: DhtPeer): void {
        if (Buffer.compare(contact.id, this.ownId) == 0) {
            return
        }
        if (!this.contactsById.hasOwnProperty(JSON.stringify(contact.id))) {
            this.contactsById[JSON.stringify(contact.id)] = new ContactWrapper(contact)
            this.contactIds.push(contact.id)
            this.contactIds.sort(this.compareIds)
        }
        
    }

    public addContacts(contacts: DhtPeer[]): void {
        contacts.forEach( (contact) => this.addContact(contact))
    }
    
    // public addContactsInBulk(contacts: Uint8Array[], client: DhtRpcClient): void {
    //     for (let i=0; i<contacts.length; i++) {
    //         if (Buffer.compare(contacts[i], this.ownId) == 0) {
    //             continue
    //         }
    //
    //         if (!this.contactsById.hasOwnProperty(JSON.stringify(contacts[i]))) {
    //             this.contactsById[JSON.stringify(contacts[i])] = new ContactWrapper(new DhtPeer(contacts[i], client))
    //             this.contactIds.push(contacts[i])
    //         }
    //     }
    //     this.contactIds.sort(this.compareIds)
    // }

    public setContacted(contactId: Uint8Array): void {
        if (this.contactsById.hasOwnProperty(JSON.stringify(contactId))) {
            this.contactsById[JSON.stringify(contactId)].contacted = true
        }
    }

    public setActive(contactId: Uint8Array): void {
        if (this.contactsById.hasOwnProperty(JSON.stringify(contactId))) {
            this.contactsById[JSON.stringify(contactId)].active = true
        }
    }

    public getUncontactedContacts(num: number): DhtPeer[] {
        const ret: DhtPeer[] = []
        for (let i = 0; i < this.contactIds.length; i++) {
            const contactId = this.contactIds[i]
            if (!this.contactsById[JSON.stringify(contactId)].contacted) {
                ret.push(this.contactsById[JSON.stringify(contactId)].contact)
                if (ret.length >= num) {
                    return ret
                }
            }
        }
        return ret
    }

    public getActiveContacts(): DhtPeer[] {
        const ret: DhtPeer[] = []
        this.contactIds.forEach((contactId) => {
            if (!this.contactsById[JSON.stringify(contactId)].active) {
                ret.push(this.contactsById[JSON.stringify(contactId)].contact)
            }
        })
        return ret
    }

    public compareIds(id1: Uint8Array, id2: Uint8Array): number {
        const distance1 = KBucket.distance(this.ownId, id1)
        const distance2 = KBucket.distance(this.ownId, id2)
        return distance1 - distance2
    }

}
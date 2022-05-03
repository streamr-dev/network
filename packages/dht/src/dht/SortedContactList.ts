import KBucket from 'k-bucket'
import { PeerID } from '../PeerID'
import { DhtPeer } from './DhtPeer'

class ContactWrapper {
    public contacted = false
    public active = false
    constructor(public contact: DhtPeer) {
    }
}

export class SortedContactList {
    private ownId: PeerID
    private contactsById: { [id: string]: ContactWrapper } = {}
    private contactIds: PeerID[] = []

    constructor(ownId: PeerID) {

        this.compareIds = this.compareIds.bind(this)
        this.ownId = ownId
    }

    public getClosestContactId(): PeerID {
        return this.contactIds[0]
    }

    public getContactIds(): PeerID[] {
        return this.contactIds
    }

    public addContact(contact: DhtPeer): void {
        if (this.ownId.equals(contact.peerId)) {
            return
        }
        if (!this.contactsById.hasOwnProperty(contact.peerId.toString())) {
            this.contactsById[contact.peerId.toString()] = new ContactWrapper(contact)
            this.contactIds.push(contact.peerId)
            this.contactIds.sort(this.compareIds)
        }  
    }

    public addContacts(contacts: DhtPeer[]): void {
        contacts.forEach( (contact) => this.addContact(contact))
    }

    public setContacted(contactId: PeerID): void {
        if (this.contactsById.hasOwnProperty(contactId.toString())) {
            this.contactsById[contactId.toString()].contacted = true
        }
    }

    public setActive(contactId: PeerID): void {
        if (this.contactsById.hasOwnProperty(contactId.toString())) {
            this.contactsById[contactId.toString()].active = true
        }
    }

    public getUncontactedContacts(num: number): DhtPeer[] {
        const ret: DhtPeer[] = []
        for (let i = 0; i < this.contactIds.length; i++) {
            const contactId = this.contactIds[i]
            if (!this.contactsById[contactId.toString()].contacted) {
                ret.push(this.contactsById[contactId.toString()].contact)
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
            if (!this.contactsById[contactId.toString()].active) {
                ret.push(this.contactsById[contactId.toString()].contact)
            }
        })
        return ret
    }

    public compareIds(id1: PeerID, id2: PeerID): number {
        const distance1 = KBucket.distance(this.ownId.value, id1.value)
        const distance2 = KBucket.distance(this.ownId.value, id2.value)
        return distance1 - distance2
    }

    public getStringIds(): string[] {
        return this.contactIds.map((peerId) => peerId.toString())
    }

    public getSize(): number {
        return this.contactIds.length
    }
}
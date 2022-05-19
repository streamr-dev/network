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
    private contactsById: { [id: string]: ContactWrapper } = {}
    private contactIds: PeerID[] = []

    constructor(private ownId: PeerID, private maxSize: number) {
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
            if (this.contactIds.length < this.maxSize) {
                this.contactsById[contact.peerId.toString()] = new ContactWrapper(contact)
                this.contactIds.push(contact.peerId)
                this.contactIds.sort(this.compareIds)
            } else if (this.compareIds(this.contactIds[this.maxSize - 1], contact.peerId) > 0) {
                const removed = this.contactIds.pop()
                delete this.contactsById[removed!.toString()]
                this.contactsById[contact.peerId.toString()] = new ContactWrapper(contact)
                this.contactIds.push(contact.peerId)
                this.contactIds.sort(this.compareIds)
            }
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
            if (this.contactsById[contactId.toString()] && !this.contactsById[contactId.toString()].contacted) {
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
            if (this.contactsById[contactId.toString()] && !this.contactsById[contactId.toString()].active) {
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

    public getContact(stringId: string): ContactWrapper {
        return this.contactsById[stringId]
    }

    public removeContact(id: PeerID): boolean {
        if (this.contactsById[id.toString()]) {
            const index = this.contactIds.indexOf(id)
            this.contactIds.splice(index, 1)
            delete this.contactsById[id.toString()]
            return true
        }
        return false
    }

    public isContact(id: PeerID): boolean {
        return !!this.contactsById[id.toString()]
    }

    public isActive(id: PeerID): boolean {
        return this.contactsById[id.toString()] ? this.contactsById[id.toString()].active : false
    }
}
import { PeerID, PeerIDKey } from '../../helpers/PeerID'
import { ContactState, Events } from './ContactList'
import { sortedIndexBy } from 'lodash'
import EventEmitter from 'eventemitter3'
import { getDistance } from '../PeerManager'

export interface SortedContactListConfig {
    referenceId: PeerID  // all contacts in this list are in sorted by the distance to this ID
    allowToContainReferenceId: boolean
    // TODO could maybe optimize this by removing the flag and then we'd check whether we have 
    // any listeners before we emit the event
    emitEvents: boolean
    maxSize?: number
    // if set, the list can't contain any contacts which are futher away than this limit
    peerIdDistanceLimit?: PeerID
    // if set, the list can't contain contacts with these ids
    excludedPeerIDs?: PeerID[]
}

export class SortedContactList<C extends { getPeerId: () => PeerID }> extends EventEmitter<Events<C>> {

    private config: SortedContactListConfig
    private contactsById: Map<PeerIDKey, ContactState<C>> = new Map()
    private contactIds: PeerID[] = []

    constructor(
        config: SortedContactListConfig
    ) {
        super()
        this.config = config
        this.compareIds = this.compareIds.bind(this)
    }

    public getClosestContactId(): PeerID {
        return this.contactIds[0]
    }

    public getContactIds(): PeerID[] {
        return this.contactIds
    }

    public addContact(contact: C): void {
        if (this.config.excludedPeerIDs !== undefined
            && this.config.excludedPeerIDs.some((peerId) => contact.getPeerId().equals(peerId))) {
            return
        }

        if ((!this.config.allowToContainReferenceId && this.config.referenceId.equals(contact.getPeerId())) ||
            (this.config.peerIdDistanceLimit !== undefined && this.compareIds(this.config.peerIdDistanceLimit, contact.getPeerId()) < 0)) {
            return
        }
        if (!this.contactsById.has(contact.getPeerId().toKey())) {
            if ((this.config.maxSize === undefined) || (this.contactIds.length < this.config.maxSize)) {
                this.contactsById.set(contact.getPeerId().toKey(), new ContactState(contact))

                const index = sortedIndexBy(this.contactIds, contact.getPeerId(), (id: PeerID) => { return this.distanceToReferenceId(id) })
                this.contactIds.splice(index, 0, contact.getPeerId())
            } else if (this.compareIds(this.contactIds[this.config.maxSize - 1], contact.getPeerId()) > 0) {
                const removedId = this.contactIds.pop()
                const removedContact = this.contactsById.get(removedId!.toKey())!.contact
                this.contactsById.delete(removedId!.toKey())
                this.contactsById.set(contact.getPeerId().toKey(), new ContactState(contact))

                const index = sortedIndexBy(this.contactIds, contact.getPeerId(), (id: PeerID) => { return this.distanceToReferenceId(id) })
                this.contactIds.splice(index, 0, contact.getPeerId())
                if (this.config.emitEvents) {
                    this.emit(
                        'contactRemoved',
                        removedContact,
                        this.getClosestContacts()
                    )
                }
            }
            if (this.config.emitEvents) {
                this.emit(
                    'newContact',
                    contact,
                    this.getClosestContacts()
                )
            }
        }
    }

    public addContacts(contacts: C[]): void {
        contacts.forEach((contact) => this.addContact(contact))
    }

    public getContact(id: PeerID): ContactState<C> | undefined {
        return this.contactsById.get(id.toKey())
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

    public getClosestContacts(limit?: number): C[] {
        const ret: C[] = []
        this.contactIds.forEach((contactId) => {
            const contact = this.contactsById.get(contactId.toKey())
            if (contact) {
                ret.push(contact.contact)
            }
        })
        if (limit === undefined) {
            return ret
        } else {
            return ret.slice(0, limit)
        }
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
        const distance1 = this.distanceToReferenceId(id1)
        const distance2 = this.distanceToReferenceId(id2)
        return distance1 - distance2
    }

    // TODO inline this method?
    private distanceToReferenceId(id: PeerID): number {
        return getDistance(this.config.referenceId.value, id.value)
    }

    public removeContact(id: PeerID): boolean {
        if (this.contactsById.has(id.toKey())) {
            const removed = this.contactsById.get(id.toKey())!.contact
            const index = this.contactIds.findIndex((element) => element.equals(id))
            this.contactIds.splice(index, 1)
            this.contactsById.delete(id.toKey())
            if (this.config.emitEvents) {
                this.emit(
                    'contactRemoved',
                    removed,
                    this.getClosestContacts()
                )
            }
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

    public getSize(): number {
        return this.contactIds.length
    }

    public clear(): void {
        this.contactsById.clear()
        this.contactIds = []
    }

    public stop(): void {
        this.removeAllListeners()
        this.clear()
    }
}

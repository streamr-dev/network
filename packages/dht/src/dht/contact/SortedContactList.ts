import { ContactState, Events } from './ContactList'
import { sortedIndexBy } from 'lodash'
import EventEmitter from 'eventemitter3'
import { getDistance } from '../PeerManager'
import { DhtAddress, getRawFromDhtAddress } from '../../identifiers'

export interface SortedContactListConfig {
    referenceId: DhtAddress  // all contacts in this list are in sorted by the distance to this ID
    allowToContainReferenceId: boolean
    // TODO could maybe optimize this by removing the flag and then we'd check whether we have 
    // any listeners before we emit the event
    emitEvents: boolean
    maxSize?: number
    // if set, the list can't contain any contacts which are futher away than this limit
    nodeIdDistanceLimit?: DhtAddress
    // if set, the list can't contain contacts with these ids
    excludedNodeIds?: Set<DhtAddress>
}

export class SortedContactList<C extends { getNodeId: () => DhtAddress }> extends EventEmitter<Events<C>> {

    private config: SortedContactListConfig
    private contactsById: Map<DhtAddress, ContactState<C>> = new Map()
    private contactIds: DhtAddress[] = []

    constructor(
        config: SortedContactListConfig
    ) {
        super()
        this.config = config
        this.compareIds = this.compareIds.bind(this)
    }

    public getClosestContactId(): DhtAddress {
        return this.contactIds[0]
    }

    public getContactIds(): DhtAddress[] {
        return this.contactIds
    }

    public addContact(contact: C): void {
        const contactId = contact.getNodeId()
        if (this.config.excludedNodeIds !== undefined && this.config.excludedNodeIds.has(contactId)) {
            return
        }
        if ((!this.config.allowToContainReferenceId && (this.config.referenceId === contactId)) ||
            (this.config.nodeIdDistanceLimit !== undefined && this.compareIds(this.config.nodeIdDistanceLimit, contactId) < 0)) {
            return
        }
        if (!this.contactsById.has(contactId)) {
            if ((this.config.maxSize === undefined) || (this.contactIds.length < this.config.maxSize)) {
                this.contactsById.set(contactId, new ContactState(contact))
                const index = sortedIndexBy(this.contactIds, contactId, (id: DhtAddress) => { return this.distanceToReferenceId(id) })
                this.contactIds.splice(index, 0, contactId)
                if (this.config.emitEvents) {
                    this.emit(
                        'contactAdded',
                        contact,
                        this.getClosestContacts()
                    )
                }
            } else if (this.compareIds(this.contactIds[this.config.maxSize - 1], contactId) > 0) {
                const removedId = this.contactIds.pop()
                const removedContact = this.contactsById.get(removedId!)!.contact
                this.contactsById.delete(removedId!)
                this.contactsById.set(contactId, new ContactState(contact))
                const index = sortedIndexBy(this.contactIds, contactId, (id: DhtAddress) => { return this.distanceToReferenceId(id) })
                this.contactIds.splice(index, 0, contactId)
                if (this.config.emitEvents) {
                    const closestContacts = this.getClosestContacts()
                    this.emit(
                        'contactRemoved',
                        removedContact,
                        closestContacts
                    )
                    this.emit(
                        'contactAdded',
                        contact,
                        closestContacts
                    )
                }
            }
        }
    }

    public addContacts(contacts: C[]): void {
        contacts.forEach((contact) => this.addContact(contact))
    }

    public getContact(id: DhtAddress): ContactState<C> | undefined {
        return this.contactsById.get(id)
    }

    has(id: DhtAddress): boolean {
        return this.contactsById.has(id)
    }

    public setActive(contactId: DhtAddress): void {
        if (this.contactsById.has(contactId)) {
            this.contactsById.get(contactId)!.active = true
        }
    }

    /*
     * Closest first then others in ascending distance order
     */
    public getClosestContacts(limit?: number): C[] {
        const ret = this.getAllContacts()
        return (limit === undefined) 
            ? ret 
            : ret.slice(0, Math.max(limit, 0))
    }

    /*
     * Furthest first then others in descending distance order
     */
    getFurthestContacts(limit?: number): C[] {
        const ret = this.getClosestContacts().toReversed()
        return (limit === undefined) 
            ? ret 
            : ret.slice(0, Math.max(limit, 0))
    }

    public getActiveContacts(limit?: number): C[] {
        const ret: C[] = []
        this.contactIds.forEach((contactId) => {
            const contact = this.contactsById.get(contactId)!
            if (contact.active) {
                ret.push(contact.contact)
            }
        })
        if (limit !== undefined) {
            return ret.slice(0, limit)
        } else {
            return ret
        }
    }

    public compareIds(id1: DhtAddress, id2: DhtAddress): number {
        const distance1 = this.distanceToReferenceId(id1)
        const distance2 = this.distanceToReferenceId(id2)
        return distance1 - distance2
    }

    // TODO inline this method?
    private distanceToReferenceId(id: DhtAddress): number {
        // TODO maybe this class should store the referenceId also as DhtAddressRaw so that we don't need to convert it here?
        return getDistance(getRawFromDhtAddress(this.config.referenceId), getRawFromDhtAddress(id))
    }

    public removeContact(id: DhtAddress): boolean {
        if (this.contactsById.has(id)) {
            const removed = this.contactsById.get(id)!.contact
            // TODO use sortedIndexBy?
            const index = this.contactIds.findIndex((nodeId) => (nodeId === id))
            this.contactIds.splice(index, 1)
            this.contactsById.delete(id)
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

    public isActive(id: DhtAddress): boolean {
        return this.contactsById.has(id) ? this.contactsById.get(id)!.active : false
    }

    public getAllContacts(): C[] {
        return this.contactIds.map((nodeId) => this.contactsById.get(nodeId)!.contact)
    }

    public getSize(excludedNodeIds?: Set<DhtAddress>): number {
        let excludedCount = 0
        if (excludedNodeIds !== undefined) {
            for (const nodeId of excludedNodeIds) {
                if (this.has(nodeId)) {
                    excludedCount++
                }
            }
        }
        return this.contactIds.length - excludedCount
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

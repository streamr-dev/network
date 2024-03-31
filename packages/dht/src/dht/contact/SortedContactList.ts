import { Events } from './ContactList'
import { sortedIndexBy } from 'lodash'
import EventEmitter from 'eventemitter3'
import { getDistance } from '../PeerManager'
import { DhtAddress, getRawFromDhtAddress } from '../../identifiers'

export interface SortedContactListConfig {
    referenceId: DhtAddress  // all contacts in this list are in sorted by the distance to this ID
    allowToContainReferenceId: boolean
    maxSize?: number
    // if set, the list can't contain any contacts which are futher away than this limit
    nodeIdDistanceLimit?: DhtAddress
    // if set, the list can't contain contacts with these ids
    excludedNodeIds?: Set<DhtAddress>
}

export class SortedContactList<C extends { getNodeId: () => DhtAddress }> extends EventEmitter<Events<C>> {

    private config: SortedContactListConfig
    private contactsById: Map<DhtAddress, C> = new Map()
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
                this.contactsById.set(contactId, contact)
                const index = sortedIndexBy(this.contactIds, contactId, (id: DhtAddress) => { return this.distanceToReferenceId(id) })
                this.contactIds.splice(index, 0, contactId)
                if (this.hasEventListeners()) {
                    this.emit(
                        'contactAdded',
                        contact,
                        this.getClosestContacts()
                    )
                }
            } else if (this.compareIds(this.contactIds[this.config.maxSize - 1], contactId) > 0) {
                const removedId = this.contactIds.pop()
                const removedContact = this.contactsById.get(removedId!)!
                this.contactsById.delete(removedId!)
                this.contactsById.set(contactId, contact)
                const index = sortedIndexBy(this.contactIds, contactId, (id: DhtAddress) => { return this.distanceToReferenceId(id) })
                this.contactIds.splice(index, 0, contactId)
                if (this.hasEventListeners()) {
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

    public getContact(id: DhtAddress): C | undefined {
        return this.contactsById.get(id)
    }

    has(id: DhtAddress): boolean {
        return this.contactsById.has(id)
    }

    /*
     * Closest first then others in ascending distance order
     */
    public getClosestContacts(limit?: number): C[] {
        const limitedContactIds = (limit === undefined) ? this.contactIds : this.contactIds.slice(0, Math.max(limit, 0)) 
        return limitedContactIds.map((nodeId) => this.contactsById.get(nodeId)!)
    }

    /*
     * Furthest first then others in descending distance order
     */
    getFurthestContacts(limit?: number): C[] {
        const ret = this.getClosestContacts().reverse()
        return (limit === undefined) 
            ? ret 
            : ret.slice(0, Math.max(limit, 0))
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
            const removed = this.contactsById.get(id)!
            // TODO use sortedIndexBy?
            const index = this.contactIds.findIndex((nodeId) => (nodeId === id))
            this.contactIds.splice(index, 1)
            this.contactsById.delete(id)
            if (this.hasEventListeners()) {
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

    public getAllContactsInUndefinedOrder(): IterableIterator<C> {
        return this.contactsById.values()
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

    private hasEventListeners(): boolean {
        return this.eventNames().length > 0
    }
}

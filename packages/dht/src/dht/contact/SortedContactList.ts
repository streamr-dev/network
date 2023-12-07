import { PeerID } from '../../helpers/PeerID'
import { ContactState, Events } from './ContactList'
import { sortedIndexBy } from 'lodash'
import EventEmitter from 'eventemitter3'
import { getDistance } from '../PeerManager'
import { NodeID, areEqualNodeIds } from '../../helpers/nodeId'
import { hexToBinary } from '@streamr/utils'

export interface SortedContactListConfig {
    referenceId: NodeID  // all contacts in this list are in sorted by the distance to this ID
    allowToContainReferenceId: boolean
    // TODO could maybe optimize this by removing the flag and then we'd check whether we have 
    // any listeners before we emit the event
    emitEvents: boolean
    maxSize?: number
    // if set, the list can't contain any contacts which are futher away than this limit
    nodeIdDistanceLimit?: NodeID
    // if set, the list can't contain contacts with these ids
    excludedNodeIDs?: NodeID[]
}

export class SortedContactList<C extends { getPeerId: () => PeerID }> extends EventEmitter<Events<C>> {

    private config: SortedContactListConfig
    private contactsById: Map<NodeID, ContactState<C>> = new Map()
    private contactIds: NodeID[] = []

    constructor(
        config: SortedContactListConfig
    ) {
        super()
        this.config = config
        this.compareIds = this.compareIds.bind(this)
    }

    public getClosestContactId(): NodeID {
        return this.contactIds[0]
    }

    public getContactIds(): NodeID[] {
        return this.contactIds
    }

    public addContact(contact: C): void {
        if (this.config.excludedNodeIDs !== undefined
            && this.config.excludedNodeIDs.some((nodeId) => areEqualNodeIds(contact.getPeerId().toNodeId(), nodeId))) {
            return
        }

        if ((!this.config.allowToContainReferenceId && areEqualNodeIds(this.config.referenceId, contact.getPeerId().toNodeId())) ||
            (this.config.nodeIdDistanceLimit !== undefined && this.compareIds(this.config.nodeIdDistanceLimit, contact.getPeerId().toNodeId()) < 0)) {
            return
        }
        if (!this.contactsById.has(contact.getPeerId().toNodeId())) {
            if ((this.config.maxSize === undefined) || (this.contactIds.length < this.config.maxSize)) {
                this.contactsById.set(contact.getPeerId().toNodeId(), new ContactState(contact))

                // eslint-disable-next-line max-len
                const index = sortedIndexBy(this.contactIds, contact.getPeerId().toNodeId(), (id: NodeID) => { return this.distanceToReferenceId(id) })
                this.contactIds.splice(index, 0, contact.getPeerId().toNodeId())
            } else if (this.compareIds(this.contactIds[this.config.maxSize - 1], contact.getPeerId().toNodeId()) > 0) {
                const removedId = this.contactIds.pop()
                const removedContact = this.contactsById.get(removedId!)!.contact
                this.contactsById.delete(removedId!)
                this.contactsById.set(contact.getPeerId().toNodeId(), new ContactState(contact))

                // eslint-disable-next-line max-len
                const index = sortedIndexBy(this.contactIds, contact.getPeerId().toNodeId(), (id: NodeID) => { return this.distanceToReferenceId(id) })
                this.contactIds.splice(index, 0, contact.getPeerId().toNodeId())
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

    public getContact(id: NodeID): ContactState<C> | undefined {
        return this.contactsById.get(id)
    }

    public setContacted(contactId: NodeID): void {
        if (this.contactsById.has(contactId)) {
            this.contactsById.get(contactId)!.contacted = true
        }
    }

    public setActive(contactId: NodeID): void {
        if (this.contactsById.has(contactId)) {
            this.contactsById.get(contactId)!.active = true
        }
    }

    public getClosestContacts(limit?: number): C[] {
        const ret: C[] = []
        this.contactIds.forEach((contactId) => {
            const contact = this.contactsById.get(contactId)
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
            const contact = this.contactsById.get(contactId)
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
            const contact = this.contactsById.get(contactId)
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

    public compareIds(id1: NodeID, id2: NodeID): number {
        const distance1 = this.distanceToReferenceId(id1)
        const distance2 = this.distanceToReferenceId(id2)
        return distance1 - distance2
    }

    // TODO inline this method?
    private distanceToReferenceId(id: NodeID): number {
        // TODO maybe this class should store the referenceId also as UInt8Array so that we don't need to convert it here?
        return getDistance(hexToBinary(this.config.referenceId), hexToBinary(id))
    }

    public removeContact(id: NodeID): boolean {
        if (this.contactsById.has(id)) {
            const removed = this.contactsById.get(id)!.contact
            // TODO use sortedIndexBy?
            const index = this.contactIds.findIndex((nodeId) => areEqualNodeIds(nodeId, id))
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

    public isActive(id: NodeID): boolean {
        return this.contactsById.has(id) ? this.contactsById.get(id)!.active : false
    }

    public getAllContacts(): C[] {
        return this.contactIds.map((nodeId) => this.contactsById.get(nodeId)!.contact)
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

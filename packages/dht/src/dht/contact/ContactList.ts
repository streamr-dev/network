import EventEmitter from 'eventemitter3'
import { NodeID } from '../../identifiers'

export class ContactState<C> {
    public contacted = false
    public active = false
    public contact: C

    constructor(contact: C) {
        this.contact = contact
    }
}

export interface Events<C> {
    contactRemoved: (removedContact: C, closestContacts: C[]) => void
    newContact: (newContact: C, closestContacts: C[]) => void
}

export class ContactList<C extends { getNodeId: () => NodeID }> extends EventEmitter<Events<C>> {

    protected contactsById: Map<NodeID, ContactState<C>> = new Map()
    // TODO move this to SortedContactList
    protected contactIds: NodeID[] = []
    protected localNodeId: NodeID
    protected maxSize: number
    protected defaultContactQueryLimit

    constructor(
        localNodeId: NodeID,
        maxSize: number,
        defaultContactQueryLimit = 20
    ) {
        super()
        this.localNodeId = localNodeId
        this.maxSize = maxSize
        this.defaultContactQueryLimit = defaultContactQueryLimit
    }

    public getContact(id: NodeID): ContactState<C> | undefined {
        return this.contactsById.get(id)
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

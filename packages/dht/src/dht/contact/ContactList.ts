import EventEmitter from 'eventemitter3'
import { DhtAddress } from '../../identifiers'

export interface Events<C> {
    contactRemoved: (removedContact: C, closestContacts: C[]) => void
    contactAdded: (contactAdded: C, closestContacts: C[]) => void
}

export class ContactList<C extends { getNodeId: () => DhtAddress }> extends EventEmitter<Events<C>> {

    protected contactsById: Map<DhtAddress, C> = new Map()
    // TODO move this to SortedContactList
    protected contactIds: DhtAddress[] = []
    protected localNodeId: DhtAddress
    protected maxSize: number
    protected defaultContactQueryLimit

    constructor(
        localNodeId: DhtAddress,
        maxSize: number,
        defaultContactQueryLimit = 20
    ) {
        super()
        this.localNodeId = localNodeId
        this.maxSize = maxSize
        this.defaultContactQueryLimit = defaultContactQueryLimit
    }

    public getContact(id: DhtAddress): C | undefined {
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

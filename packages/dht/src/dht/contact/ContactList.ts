import EventEmitter from 'eventemitter3'
import { DhtAddress } from '../../identifiers'

export interface Events<C> {
    contactRemoved: (removedContact: C) => void
    contactAdded: (contactAdded: C) => void
}

export class ContactList<C extends { getNodeId: () => DhtAddress }> extends EventEmitter<Events<C>> {
    protected contactsById: Map<DhtAddress, C> = new Map()
    // TODO move this to SortedContactList
    protected contactIds: DhtAddress[] = []
    protected localNodeId: DhtAddress
    protected maxSize: number

    constructor(localNodeId: DhtAddress, maxSize: number) {
        super()
        this.localNodeId = localNodeId
        this.maxSize = maxSize
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

import { PeerID, PeerIDKey } from '../../helpers/PeerID'
import EventEmitter from 'eventemitter3'
import { Events, ContactState } from './Contact'

export class ContactList<C extends { getPeerId: () => PeerID }> extends EventEmitter<Events<C>> {

    protected contactsById: Map<PeerIDKey, ContactState<C>> = new Map()
    protected contactIds: PeerID[] = []
    protected ownId: PeerID
    protected maxSize: number
    protected defaultContactQueryLimit

    constructor(
        ownId: PeerID,
        maxSize: number,
        defaultContactQueryLimit = 20
    ) {
        super()
        this.ownId = ownId
        this.maxSize = maxSize
        this.defaultContactQueryLimit = defaultContactQueryLimit
    }

    public getContact(id: PeerID): ContactState<C> {
        return this.contactsById.get(id.toKey())!
    }

    public hasContact(id: PeerID): boolean {
        return this.contactsById.has(id.toKey())
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

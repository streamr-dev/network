import { PeerDescriptor } from '../../proto/DhtRpc'
import { Events, IContact, ContactState } from './Contact'

import EventEmitter from 'eventemitter3'
import { PeerID, PeerIDKey } from '../../helpers/PeerID'
export class SortedContactList<Contact extends IContact> extends EventEmitter<Events> {
    private contactsById: Map<PeerIDKey, ContactState<Contact>> = new Map()
    private contactIds: PeerID[] = []

    constructor(private ownId: PeerID, private maxSize: number) {
        super()
        this.ownId = ownId
    }

    addContact(contact: IContact): void {
        
    }

    addContacts(contacts: IContact[]): void {
        contacts.forEach((contact) => this.addContact(contact))
    }

    removeContact(id: PeerID): boolean {
        return true
    }

    public getSize(): number {
        return this.contactIds.length
    }

    public getContact(id: PeerID): ContactState<Contact> {
        return this.contactsById.get(id.toKey())!
    }
}

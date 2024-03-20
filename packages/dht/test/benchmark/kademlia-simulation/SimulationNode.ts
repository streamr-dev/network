import KBucket from 'k-bucket'
import { Contact } from './Contact'
import { SortedContactList } from '../../../src/dht/contact/SortedContactList'
import { DhtAddress, getRawFromDhtAddress } from '../../../src/identifiers'

export class SimulationNode {

    private numberOfNodesPerKBucket = 1
    private K = 8
    private ALPHA = 1

    private bucket: KBucket<Contact>
    private ownContact: Contact

    private incomingRpcCallCount = 0
    private outgoingRpcCallCount = 0

    private neighborList: SortedContactList<Contact>
    private ownId: DhtAddress

    constructor(ownId: DhtAddress) {
        this.ownId = ownId
        this.ownContact = new Contact(this.ownId, this)
        this.bucket = new KBucket({
            localNodeId: getRawFromDhtAddress(this.ownId),
            numberOfNodesPerKBucket: this.numberOfNodesPerKBucket
        })

        this.neighborList = new SortedContactList({ 
            referenceId: this.ownId,
            maxSize: 1000,
            allowToContainReferenceId: false,
            emitEvents: false
        })
    }

    // For simulation use

    public getNeightborList(): SortedContactList<Contact> {
        return this.neighborList
    }
    public getContact(): Contact {
        return this.ownContact
    }

    public getKBucketSize(): number {
        return this.bucket.count()
    }

    public getIncomingRpcCallCount(): number {
        return this.incomingRpcCallCount
    }

    public getOutgoingRpcCallCount(): number {
        return this.outgoingRpcCallCount
    }

    // RPC call

    public getClosestNodesTo(id: DhtAddress, caller: SimulationNode): Contact[] {
        this.incomingRpcCallCount++
        const idValue = getRawFromDhtAddress(id)
        const ret = this.bucket.closest(idValue)
        if (!this.bucket.get(idValue)) {
            const contact = new Contact(id, caller)
            this.bucket.add(contact)
            this.neighborList.addContact(contact)
        }
        return ret
    }

    private findMoreContacts(contactList: Contact[], shortlist: SortedContactList<Contact>) {
        contactList.forEach((contact) => {
            shortlist.setActive(contact.getNodeId())
            this.outgoingRpcCallCount++
            const returnedContacts = contact.dhtNode!.getClosestNodesTo(this.ownId, this)
            shortlist.addContacts(returnedContacts)
            returnedContacts.forEach((returnedContact: Contact) => {
                if (!this.bucket.get(returnedContact.id)) {
                    this.bucket.add(returnedContact)
                }
            })
        })
    }

    public joinDht(entryPoint: SimulationNode): void {
        if (entryPoint.getContact().getNodeId() === this.ownId) {
            return
        }

        this.bucket.add(entryPoint.getContact())
        const closest = this.bucket.closest(getRawFromDhtAddress(this.ownId), this.ALPHA)

        this.neighborList.addContacts(closest)

        /* eslint-disable no-constant-condition */
        while (true) {
            let oldClosestContactId = this.neighborList.getClosestContactId()
            let uncontacted = this.neighborList.getActiveContacts(this.ALPHA)
            if (uncontacted.length === 0) {
                return
            }

            this.findMoreContacts(uncontacted, this.neighborList)

            if (oldClosestContactId === this.neighborList.getClosestContactId()) {
                uncontacted = this.neighborList.getActiveContacts(this.K)
                if (uncontacted.length === 0) {
                    return
                }

                while (true) {
                    oldClosestContactId = this.neighborList.getClosestContactId()
                    this.findMoreContacts(uncontacted, this.neighborList)

                    if (this.neighborList.getActiveContacts().length >= this.K ||
                        (oldClosestContactId === this.neighborList.getClosestContactId())) {
                        return
                    }
                    uncontacted = this.neighborList.getActiveContacts(this.ALPHA)
                    if (uncontacted.length === 0) {
                        return
                    }
                }
            }
        }
    }
}

import KBucket from 'k-bucket'
import { Contact } from './Contact'
import { SortedContactList } from '../../../src/dht/contact/SortedContactList'
import { PeerID } from '../../../src/helpers/PeerID'

export class SimulationNode {

    private numberOfNodesPerKBucket = 1
    private K = 8
    private ALPHA = 1

    private bucket: KBucket<Contact>
    private ownContact: Contact

    private numberOfIncomingRpcCalls = 0
    private numberOfOutgoingRpcCalls = 0

    private neighborList: SortedContactList<Contact>

    constructor(private ownId: PeerID) {
        this.ownId = ownId
        this.ownContact = new Contact(this.ownId, this)
        this.bucket = new KBucket({
            localNodeId: this.ownId.value,
            numberOfNodesPerKBucket: this.numberOfNodesPerKBucket
        })

        this.neighborList = new SortedContactList(this.ownId, 1000)
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

    public getNumberOfIncomingRpcCalls(): number {
        return this.numberOfIncomingRpcCalls
    }

    public getNumberOfOutgoingRpcCalls(): number {
        return this.numberOfOutgoingRpcCalls
    }

    // RPC call

    public getClosestNodesTo(id: PeerID, caller: SimulationNode): Contact[] {
        this.numberOfIncomingRpcCalls++
        const ret = this.bucket.closest(id.value)

        if (!this.bucket.get(id.value)) {
            const contact = new Contact(PeerID.fromValue(id.value), caller)
            this.bucket.add(contact)
            this.neighborList.addContact(contact)
        }

        return ret
    }

    private findMoreContacts(contactList: Contact[], shortlist: SortedContactList<Contact>) {
        contactList.forEach((contact) => {
            shortlist.setContacted(contact.peerId)
            shortlist.setActive(contact.peerId)
            this.numberOfOutgoingRpcCalls++
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
        if (entryPoint.getContact().peerId.equals(this.ownId)) {
            return
        }

        this.bucket.add(entryPoint.getContact())
        const closest = this.bucket.closest(this.ownId.value, this.ALPHA)

        this.neighborList.addContacts(closest)

        /* eslint-disable no-constant-condition */
        while (true) {
            let oldClosestContactId = this.neighborList.getClosestContactId()
            let uncontacted = this.neighborList.getUncontactedContacts(this.ALPHA)
            if (uncontacted.length < 1) {
                return
            }

            this.findMoreContacts(uncontacted, this.neighborList)

            if (oldClosestContactId.equals(this.neighborList.getClosestContactId())) {
                uncontacted = this.neighborList.getUncontactedContacts(this.K)
                if (uncontacted.length < 1) {
                    return
                }

                while (true) {
                    oldClosestContactId = this.neighborList.getClosestContactId()
                    this.findMoreContacts(uncontacted, this.neighborList)

                    if (this.neighborList.getActiveContacts().length >= this.K ||
                        oldClosestContactId.equals(this.neighborList.getClosestContactId())) {
                        return
                    }
                    uncontacted = this.neighborList.getUncontactedContacts(this.ALPHA)
                    if (uncontacted.length < 1) {
                        return
                    }
                }
            }
        }
    }
}

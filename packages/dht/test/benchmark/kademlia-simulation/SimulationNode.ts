import KBucket from 'k-bucket'
import { Contact } from './Contact'
import { SortedContactList } from '../../../src/dht/contact/SortedContactList'
import { NodeID, areEqualNodeIds } from '../../../src/helpers/nodeId'
import { hexToBinary } from '@streamr/utils'

export class SimulationNode {

    private numberOfNodesPerKBucket = 1
    private K = 8
    private ALPHA = 1

    private bucket: KBucket<Contact>
    private ownContact: Contact

    private numberOfIncomingRpcCalls = 0
    private numberOfOutgoingRpcCalls = 0

    private neighborList: SortedContactList<Contact>
    private ownId: NodeID

    constructor(ownId: NodeID) {
        this.ownId = ownId
        this.ownContact = new Contact(this.ownId, this)
        this.bucket = new KBucket({
            localNodeId: hexToBinary(this.ownId),
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

    public getNumberOfIncomingRpcCalls(): number {
        return this.numberOfIncomingRpcCalls
    }

    public getNumberOfOutgoingRpcCalls(): number {
        return this.numberOfOutgoingRpcCalls
    }

    // RPC call

    public getClosestNodesTo(id: NodeID, caller: SimulationNode): Contact[] {
        this.numberOfIncomingRpcCalls++
        const idValue = hexToBinary(id)
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
            shortlist.setContacted(contact.getNodeId())
            shortlist.setActive(contact.getNodeId())
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
        if (areEqualNodeIds(entryPoint.getContact().getNodeId(), this.ownId)) {
            return
        }

        this.bucket.add(entryPoint.getContact())
        const closest = this.bucket.closest(hexToBinary(this.ownId), this.ALPHA)

        this.neighborList.addContacts(closest)

        /* eslint-disable no-constant-condition */
        while (true) {
            let oldClosestContactId = this.neighborList.getClosestContactId()
            let uncontacted = this.neighborList.getUncontactedContacts(this.ALPHA)
            if (uncontacted.length === 0) {
                return
            }

            this.findMoreContacts(uncontacted, this.neighborList)

            if (areEqualNodeIds(oldClosestContactId, this.neighborList.getClosestContactId())) {
                uncontacted = this.neighborList.getUncontactedContacts(this.K)
                if (uncontacted.length === 0) {
                    return
                }

                while (true) {
                    oldClosestContactId = this.neighborList.getClosestContactId()
                    this.findMoreContacts(uncontacted, this.neighborList)

                    if (this.neighborList.getActiveContacts().length >= this.K ||
                        areEqualNodeIds(oldClosestContactId, this.neighborList.getClosestContactId())) {
                        return
                    }
                    uncontacted = this.neighborList.getUncontactedContacts(this.ALPHA)
                    if (uncontacted.length === 0) {
                        return
                    }
                }
            }
        }
    }
}

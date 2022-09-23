import { PeerDescriptor } from "../exports"
import { DhtPeer } from "./DhtPeer"
import { SortedContactList } from "./SortedContactList"
import { PeerID } from '../helpers/PeerID'

export class RoutingSession {
    private contactList: SortedContactList<DhtPeer>
    
    constructor(destinationPeer: PeerDescriptor, previousPeer: PeerDescriptor, parallelism: number) {
        this.contactList = new SortedContactList(PeerID.fromValue(destinationPeer.peerId), 1000, true, PeerID.fromValue(previousPeer.peerId) )
    }

    start(): void {
        
    }
}
import KBucket from "k-bucket"
import { PeerID, PeerIDKey } from "../helpers/PeerID"
import { DhtPeer } from "./DhtPeer"

export class StreamrKBucket extends KBucket<DhtPeer> {

    private contactsBeingAdded: Map<PeerIDKey, DhtPeer> = new Map()

    constructor(...options: ConstructorParameters<typeof KBucket< DhtPeer >>) {
        super(...options)

        this.on('added', (peer: DhtPeer) => {
            this.contactsBeingAdded.delete(peer.peerId.toKey())
        })

    }

    override add(contact: DhtPeer): KBucket<DhtPeer> {
        this.contactsBeingAdded.set(contact.peerId.toKey(), contact)
        return super.add(contact)
    }

    override get(id: Uint8Array): DhtPeer | null {
        let ret = super.get(id) 
        if (!ret) {
            ret = this.contactsBeingAdded.has(PeerID.fromValue(id).toKey()) ? this.contactsBeingAdded.get(PeerID.fromValue(id).toKey())! : null
        }
        return ret
    }

    public reportAddingFailed(contact: DhtPeer): void {
        this.contactsBeingAdded.delete(contact.peerId.toKey())
    }

}

import { PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import { ProtoRpcClient } from '@streamr/proto-rpc'
import { peerIdFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { PeerID } from '../../helpers/PeerID'
import { IContact } from './Contact'

export abstract class Remote<T> implements IContact {

    protected readonly peerId: PeerID
    protected readonly peerDescriptor: PeerDescriptor
    protected readonly client: ProtoRpcClient<T>
    protected readonly serviceId: string
    protected readonly ownPeerDescriptor: PeerDescriptor

    constructor(
        ownPeerDescriptor: PeerDescriptor,
        peerDescriptor: PeerDescriptor,
        client: ProtoRpcClient<T>,
        serviceId: string
    ) {
        this.ownPeerDescriptor = ownPeerDescriptor
        this.peerId = peerIdFromPeerDescriptor(peerDescriptor)
        this.peerDescriptor = peerDescriptor
        this.client = client
        this.serviceId = serviceId
    }

    getPeerId(): PeerID {
        return this.peerId
    }

    getPeerDescriptor(): PeerDescriptor {
        return this.peerDescriptor
    }

    getServiceId(): string {
        return this.serviceId
    }

}

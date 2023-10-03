import { PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import { ProtoRpcClient } from '@streamr/proto-rpc'
import { peerIdFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { PeerID } from '../../helpers/PeerID'
import { IContact } from './Contact'
import { DhtRpcOptions } from '../../rpc-protocol/DhtRpcOptions'

export abstract class Remote<T> implements IContact {

    protected readonly remotePeerId: PeerID
    protected readonly remotePeerDescriptor: PeerDescriptor
    protected readonly client: ProtoRpcClient<T>
    protected readonly serviceId: string
    protected readonly ownPeerDescriptor: PeerDescriptor

    constructor(
        ownPeerDescriptor: PeerDescriptor,
        remotePeerDescriptor: PeerDescriptor,
        client: ProtoRpcClient<T>,
        serviceId: string
    ) {
        this.ownPeerDescriptor = ownPeerDescriptor
        this.remotePeerId = peerIdFromPeerDescriptor(remotePeerDescriptor)
        this.remotePeerDescriptor = remotePeerDescriptor
        this.client = client
        this.serviceId = serviceId
    }

    getPeerId(): PeerID {
        return this.remotePeerId
    }

    getPeerDescriptor(): PeerDescriptor {
        return this.remotePeerDescriptor
    }

    getServiceId(): string {
        return this.serviceId
    }

    getClient(): ProtoRpcClient<T> {
        return this.client
    }

    formDhtRpcOptions(
        ownPeerDescriptor: PeerDescriptor,
        opts?: Omit<Partial<DhtRpcOptions>, 'sourceDescriptor' | 'targetDescriptor'>
    ): DhtRpcOptions {
        return {
            sourceDescriptor: ownPeerDescriptor,
            targetDescriptor: this.remotePeerDescriptor,
            ...opts
        }
    }
}

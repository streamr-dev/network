import { PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import { ProtoRpcClient } from '@streamr/proto-rpc'
import { peerIdFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { PeerID } from '../../helpers/PeerID'
import { IContact } from './Contact'
import { DhtRpcOptions } from '../../rpc-protocol/DhtRpcOptions'

export abstract class Remote<T> implements IContact {

    private readonly localPeerDescriptor: PeerDescriptor
    private readonly remotePeerId: PeerID
    private readonly remotePeerDescriptor: PeerDescriptor
    private readonly serviceId: string
    private readonly client: ProtoRpcClient<T>

    constructor(
        localPeerDescriptor: PeerDescriptor,
        remotePeerDescriptor: PeerDescriptor,
        serviceId: string,
        client: ProtoRpcClient<T>
    ) {
        this.localPeerDescriptor = localPeerDescriptor
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

    getLocalPeerDescriptor(): PeerDescriptor {
        return this.localPeerDescriptor
    }

    getServiceId(): string {
        return this.serviceId
    }

    getClient(): ProtoRpcClient<T> {
        return this.client
    }

    formDhtRpcOptions(opts?: Omit<DhtRpcOptions, 'sourceDescriptor' | 'targetDescriptor'>): DhtRpcOptions {
        return {
            sourceDescriptor: this.localPeerDescriptor,
            targetDescriptor: this.remotePeerDescriptor,
            ...opts
        }
    }
}

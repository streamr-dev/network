import { PeerDescriptor } from '@streamr/dht'
import { ProtoRpcClient } from '@streamr/proto-rpc'

export abstract class Remote<T> {
    protected remotePeerDescriptor: PeerDescriptor
    protected client: ProtoRpcClient<T>
    protected serviceId: string

    constructor(peerDescriptor: PeerDescriptor, serviceId: string, client: ProtoRpcClient<T>) {
        this.remotePeerDescriptor = peerDescriptor
        this.client = client
        this.serviceId = serviceId
    }

    getPeerDescriptor(): PeerDescriptor {
        return this.remotePeerDescriptor
    }

}

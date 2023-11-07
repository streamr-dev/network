import { PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import { ProtoRpcClient } from '@streamr/proto-rpc'
import { DhtRpcOptions } from '../../rpc-protocol/DhtRpcOptions'
import { ServiceID } from '../../types/ServiceID'
import { ConnectionType } from '../../connection/IConnection'
import { expectedConnectionType } from '../../helpers/Connectivity'

const getRpcTimeout = (localPeerDescriptor: PeerDescriptor, remotePeerDescriptor: PeerDescriptor): number => {
    const connectionType = expectedConnectionType(localPeerDescriptor, remotePeerDescriptor)
    if (connectionType === ConnectionType.WEBSOCKET_CLIENT) {
        return 5000
    } else if (connectionType === ConnectionType.WEBSOCKET_SERVER) {
        return 10000
    } else if (connectionType === ConnectionType.WEBRTC) {
        return 15000
    }
    return 15000
}

export abstract class Remote<T> {

    private readonly localPeerDescriptor: PeerDescriptor
    private readonly remotePeerDescriptor: PeerDescriptor
    private readonly serviceId: ServiceID
    private readonly client: ProtoRpcClient<T>
    private readonly defaultTimeout?: number
    constructor(
        localPeerDescriptor: PeerDescriptor,
        remotePeerDescriptor: PeerDescriptor,
        serviceId: ServiceID,
        client: ProtoRpcClient<T>,
        defaultTimeout?: number
    ) {
        this.localPeerDescriptor = localPeerDescriptor
        this.remotePeerDescriptor = remotePeerDescriptor
        this.client = client
        this.serviceId = serviceId
        this.defaultTimeout = defaultTimeout
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
            timeout: this.defaultTimeout ?? getRpcTimeout(this.localPeerDescriptor, this.remotePeerDescriptor),
            ...opts
        }
    }
}

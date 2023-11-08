import { PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import { ProtoRpcClient } from '@streamr/proto-rpc'
import { DhtRpcOptions } from '../../rpc-protocol/DhtRpcOptions'
import { ServiceID } from '../../types/ServiceID'
import { ConnectionType } from '../../connection/IConnection'
import { expectedConnectionType } from '../../helpers/Connectivity'

const WEBSOCKET_CLIENT_TIMEOUT = 5000
const WEBSOCKET_SERVER_TIMEOUT = 7500
const WEBRTC_TIMEOUT = 15000

const getRpcTimeout = (localPeerDescriptor: PeerDescriptor, remotePeerDescriptor: PeerDescriptor): number => {
    const connectionType = expectedConnectionType(localPeerDescriptor, remotePeerDescriptor)
    if (connectionType === ConnectionType.WEBSOCKET_CLIENT) {
        return WEBSOCKET_CLIENT_TIMEOUT
    } else if (connectionType === ConnectionType.WEBSOCKET_SERVER) {
        return WEBSOCKET_SERVER_TIMEOUT
    } else if (connectionType === ConnectionType.WEBRTC) {
        return WEBRTC_TIMEOUT
    }
    return WEBRTC_TIMEOUT
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

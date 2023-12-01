import { PeerDescriptor } from '../../proto/packages/dht/protos/DhtRpc'
import { ProtoRpcClient } from '@streamr/proto-rpc'
import { DhtRpcOptions } from '../../rpc-protocol/DhtRpcOptions'
import { ServiceID } from '../../types/ServiceID'
import { ConnectionType } from '../../connection/IConnection'
import { expectedConnectionType } from '../../helpers/Connectivity'

// Should connect directly to the server, timeout can be low
const WEBSOCKET_CLIENT_TIMEOUT = 5000
// Requires a WebsocketConnectionRequest to be routed to the client before the connection can be opened
// takes a little bit longer than WEBSOCKET_CLIENT
const WEBSOCKET_SERVER_TIMEOUT = 7500
// WebRTC connections require lots of signalling to open and might take a longer time.
const WEBRTC_TIMEOUT = 15000
// default timeout for existing connections
export const EXISTING_CONNECTION_TIMEOUT = 5000

const getTimeout = (localPeerDescriptor: PeerDescriptor, remotePeerDescriptor: PeerDescriptor): number => {
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

export abstract class RpcRemote<T> {

    private readonly localPeerDescriptor: PeerDescriptor
    private readonly remotePeerDescriptor: PeerDescriptor
    private readonly serviceId: ServiceID
    private readonly client: ProtoRpcClient<T>
    private readonly timeout?: number

    constructor(
        localPeerDescriptor: PeerDescriptor,
        remotePeerDescriptor: PeerDescriptor,
        serviceId: ServiceID,
        client: ProtoRpcClient<T>,
        timeout?: number
    ) {
        this.localPeerDescriptor = localPeerDescriptor
        this.remotePeerDescriptor = remotePeerDescriptor
        this.client = client
        this.serviceId = serviceId
        this.timeout = timeout
    }

    getPeerDescriptor(): PeerDescriptor {
        return this.remotePeerDescriptor
    }

    getLocalPeerDescriptor(): PeerDescriptor {
        return this.localPeerDescriptor
    }

    getServiceId(): ServiceID {
        return this.serviceId
    }

    getClient(): ProtoRpcClient<T> {
        return this.client
    }

    formDhtRpcOptions(opts?: Omit<DhtRpcOptions, 'sourceDescriptor' | 'targetDescriptor'>): DhtRpcOptions {
        return {
            sourceDescriptor: this.localPeerDescriptor,
            targetDescriptor: this.remotePeerDescriptor,
            timeout: this.timeout ?? getTimeout(this.localPeerDescriptor, this.remotePeerDescriptor),
            ...opts
        }
    }
}

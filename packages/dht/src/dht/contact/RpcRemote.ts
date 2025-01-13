import type { ServiceInfo } from '@protobuf-ts/runtime-rpc'
import { ClassType, ClientTransport, ProtoRpcClient, RpcCommunicator, toProtoRpcClient } from '@streamr/proto-rpc'
import { ConnectionType } from '../../connection/IConnection'
import { expectedConnectionType } from '../../helpers/Connectivity'
import { PeerDescriptor } from '../../../generated/packages/dht/protos/DhtRpc'
import { DhtRpcOptions } from '../../rpc-protocol/DhtRpcOptions'
import { DhtCallContext } from '../../rpc-protocol/DhtCallContext'

// Should connect directly to the server, timeout can be low
const WEBSOCKET_CLIENT_TIMEOUT = 5000
// Requires a WebsocketConnectionRequest to be routed to the client before the connection can be opened
// takes a little bit longer than WEBSOCKET_CLIENT
const WEBSOCKET_SERVER_TIMEOUT = 7500
// WebRTC connections require lots of signalling to open and might take a longer time.
const WEBRTC_TIMEOUT = 10000
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

export abstract class RpcRemote<T extends ServiceInfo & ClassType> {
    private readonly localPeerDescriptor: PeerDescriptor
    private readonly remotePeerDescriptor: PeerDescriptor
    private readonly client: ProtoRpcClient<T>
    private readonly timeout?: number

    constructor(
        localPeerDescriptor: PeerDescriptor,
        remotePeerDescriptor: PeerDescriptor,
        rpcCommunicator: RpcCommunicator<DhtCallContext>,
        // eslint-disable-next-line @typescript-eslint/prefer-function-type
        clientClass: { new (clientTransport: ClientTransport): T },
        timeout?: number
    ) {
        this.localPeerDescriptor = localPeerDescriptor
        this.remotePeerDescriptor = remotePeerDescriptor
        this.client = toProtoRpcClient(new clientClass(rpcCommunicator.getRpcClientTransport()))
        this.timeout = timeout
    }

    getPeerDescriptor(): PeerDescriptor {
        return this.remotePeerDescriptor
    }

    getLocalPeerDescriptor(): PeerDescriptor {
        return this.localPeerDescriptor
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

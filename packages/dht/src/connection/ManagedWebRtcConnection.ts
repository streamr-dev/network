import { PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'
import { ConnectionType } from './IConnection'
import { ManagedConnection } from './ManagedConnection'
import { NodeWebRtcConnection } from './WebRTC/NodeWebRtcConnection'

export class ManagedWebRtcConnection extends ManagedConnection {

    constructor(ownPeerDescriptor: PeerDescriptor,
        protocolVersion: string,
        connectingConnection?: NodeWebRtcConnection,
        connectedConnection?: NodeWebRtcConnection,
        presumedPeerDescriptor?: PeerDescriptor,
    ) {
        super(
            ownPeerDescriptor,
            protocolVersion,
            ConnectionType.WEBRTC,
            connectingConnection,
            connectedConnection,
            presumedPeerDescriptor
        )
    }

    public getWebRtcConnection(): NodeWebRtcConnection {
        if (this.outgoingConnection) {
            return this.outgoingConnection as unknown as NodeWebRtcConnection
        } else {
            return this.incomingConnection as unknown as NodeWebRtcConnection
        }
    }
}

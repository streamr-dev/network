import { PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'
import { ConnectionType } from './IConnection'
import { ManagedConnection } from './ManagedConnection'
import { NodeWebRtcConnection } from './WebRTC/NodeWebRtcConnection'

export class ManagedWebRtcConnection extends ManagedConnection {

    constructor(localPeerDescriptor: PeerDescriptor,
        connectingConnection?: NodeWebRtcConnection,
        connectedConnection?: NodeWebRtcConnection) {
        super(
            localPeerDescriptor,
            ConnectionType.WEBRTC,
            connectingConnection,
            connectedConnection)
    }

    public getWebRtcConnection(): NodeWebRtcConnection {
        if (this.outgoingConnection) {
            return this.outgoingConnection as unknown as NodeWebRtcConnection
        } else {
            return this.incomingConnection as unknown as NodeWebRtcConnection
        }
    }
}

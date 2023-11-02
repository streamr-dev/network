import { PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'
import { ConnectionType } from './IConnection'
import { ManagedConnection } from './ManagedConnection'
import { NodeWebRtcConnection } from './webrtc/NodeWebRtcConnection'

export class ManagedWebRtcConnection extends ManagedConnection {

    constructor(ownPeerDescriptor: PeerDescriptor,
        connectingConnection?: NodeWebRtcConnection,
        connectedConnection?: NodeWebRtcConnection) {
        super(
            ownPeerDescriptor,
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

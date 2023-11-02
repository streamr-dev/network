import { PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'
import { ConnectionType } from './IConnection'
import { ManagedConnection } from './ManagedConnection'
import { NodeWebrtcConnection } from './webrtc/NodeWebrtcConnection'

export class ManagedWebrtcConnection extends ManagedConnection {

    constructor(ownPeerDescriptor: PeerDescriptor,
        connectingConnection?: NodeWebrtcConnection,
        connectedConnection?: NodeWebrtcConnection) {
        super(
            ownPeerDescriptor,
            ConnectionType.WEBRTC,
            connectingConnection,
            connectedConnection)
    }

    public getWebRtcConnection(): NodeWebrtcConnection {
        if (this.outgoingConnection) {
            return this.outgoingConnection as unknown as NodeWebrtcConnection
        } else {
            return this.incomingConnection as unknown as NodeWebrtcConnection
        }
    }
}

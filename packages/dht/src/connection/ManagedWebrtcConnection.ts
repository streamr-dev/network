import { PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'
import { ConnectionType } from './IConnection'
import { ManagedConnection } from './ManagedConnection'
import { NodeWebrtcConnection } from './webrtc/NodeWebrtcConnection'

export class ManagedWebrtcConnection extends ManagedConnection {

    constructor(localPeerDescriptor: PeerDescriptor,
        connectingConnection?: NodeWebrtcConnection,
        connectedConnection?: NodeWebrtcConnection,
        remotePeerDescriptor?: PeerDescriptor,
    ) {
        super(
            localPeerDescriptor,
            ConnectionType.WEBRTC,
            connectingConnection,
            connectedConnection,
            remotePeerDescriptor
        )
    }

    public getWebrtcConnection(): NodeWebrtcConnection {
        if (this.outgoingConnection) {
            return this.outgoingConnection as unknown as NodeWebrtcConnection
        } else {
            return this.incomingConnection as unknown as NodeWebrtcConnection
        }
    }
}

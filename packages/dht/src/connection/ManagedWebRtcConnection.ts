import { PeerDescriptor } from "../proto/DhtRpc"
import { ConnectionType } from "./IConnection"
import { ManagedConnection } from "./ManagedConnection"
import { NodeWebRtcConnection } from "./WebRTC/NodeWebRtcConnection"

export enum Event {
    HANDSHAKE_FAILED = 'streamr:handshaker:handshake:failed',
    HANDSHAKE_COMPLETED = 'streamr:handshaker:handshake:completed'
}

export class ManagedWebRtcConnection extends ManagedConnection  {

    constructor(ownPeerDescriptor: PeerDescriptor,
        protocolVersion: string,
        connectingConnection: NodeWebRtcConnection) {
        super(
            ownPeerDescriptor,
            protocolVersion,
            ConnectionType.WEBRTC,
            connectingConnection,
            undefined)
    }

    public getWebRtcConnection(): NodeWebRtcConnection {
        return this.connectingConnection as unknown as NodeWebRtcConnection
    }   
}

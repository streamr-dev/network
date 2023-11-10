import { ManagedConnection } from './ManagedConnection'
import { NodeWebrtcConnection } from './webrtc/NodeWebrtcConnection'

export class ManagedWebrtcConnection extends ManagedConnection {

    public getWebrtcConnection(): NodeWebrtcConnection {
        if (this.outgoingConnection) {
            return this.outgoingConnection as unknown as NodeWebrtcConnection
        } else {
            return this.incomingConnection as unknown as NodeWebrtcConnection
        }
    }
}

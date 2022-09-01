import EventEmitter from "eventemitter3"
import { PeerDescriptor } from "../proto/DhtRpc"
import { ConnectionID, ConnectionType, ConnectionEvent } from "./IConnection"

export class Connection extends EventEmitter<ConnectionEvent> {
    public connectionId: ConnectionID
    //public connectionType: ConnectionType
    private peerDescriptor?: PeerDescriptor
    
    constructor(public connectionType: ConnectionType) {
        super()
        this.connectionId = new ConnectionID()
        //this.connectionType = connectionType
    }
    setPeerDescriptor(peerDescriptor: PeerDescriptor): void {
        this.peerDescriptor = peerDescriptor
    }
    
    getPeerDescriptor(): PeerDescriptor | undefined {
        return this.peerDescriptor
    }
}

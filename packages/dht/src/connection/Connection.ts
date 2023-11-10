import EventEmitter from 'eventemitter3'
import { PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'
import { ConnectionID, ConnectionEvents } from './IConnection'

// TODO merge with SimulatorConnection?
export class Connection extends EventEmitter<ConnectionEvents> {
    public connectionId: ConnectionID
    private peerDescriptor?: PeerDescriptor
    
    constructor() {
        super()
        this.connectionId = new ConnectionID()
    }

    setPeerDescriptor(peerDescriptor: PeerDescriptor): void {
        this.peerDescriptor = peerDescriptor
    }
    
    getPeerDescriptor(): PeerDescriptor | undefined {
        return this.peerDescriptor
    }
}

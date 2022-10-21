import { ConnectionEvents, IConnection } from "./IConnection"
import EventEmitter from "eventemitter3"
import { Simulator } from "./Simulator"
import { PeerDescriptor } from "../proto/DhtRpc"

export class SimulatorConnection extends EventEmitter<ConnectionEvents> implements IConnection {

    private closed = false
    constructor(private ownPeerDescriptor: PeerDescriptor, private targetPeerDescriptor: PeerDescriptor, 
        private simulator: Simulator) {
        super()
    }

    send(data: Uint8Array): void {
        this.simulator.send(this.ownPeerDescriptor, this.targetPeerDescriptor, data)
    }

    close(): void {
        this.simulator.disconnect(this.ownPeerDescriptor, this.targetPeerDescriptor)
        this.emit('disconnected')
    }

    connect(): void {
        this.simulator.connect(this.ownPeerDescriptor, this.targetPeerDescriptor)
        this.emit('connected')
    }

    handleIncomingData(data: Uint8Array): void {
        this.emit('data', data)
    }

    handleIncomingDisconnection(): void {
        this.emit('disconnected')
    }
}

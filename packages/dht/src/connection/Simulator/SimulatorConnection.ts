import { ConnectionType, IConnection } from "../IConnection"
import { Simulator } from "./Simulator"
import { PeerDescriptor } from "../../proto/DhtRpc"
import { Connection } from "../Connection"

export class SimulatorConnection extends Connection implements IConnection {

    constructor(public ownPeerDescriptor: PeerDescriptor, private targetPeerDescriptor: PeerDescriptor,
        connectionType: ConnectionType,
        private simulator: Simulator) {
        super(connectionType)
        this.close = this.close.bind(this)
    }

    send(data: Uint8Array): void {
        this.simulator.send(this, data)
            .then(() => {
                return
            }).catch((_e) => { })
    }

    close(): void {
        this.simulator.disconnect(this)
            .then(() => {
                this.emit('disconnected')
                return
            }).catch((_e) => { })

        this.removeAllListeners()
    }

    connect(): void {
        this.simulator.connect(this, this.targetPeerDescriptor)
            .then(() => {
                this.emit('connected')
                return
            }).catch((_e) => { })
    }

    handleIncomingData(data: Uint8Array): void {
        this.emit('data', data)
    }

    handleIncomingDisconnection(): void {
        this.emit('disconnected')
        this.removeAllListeners()
    }
}

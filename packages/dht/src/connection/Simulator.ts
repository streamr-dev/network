import EventEmitter from "eventemitter3"
import { PeerID, PeerIDKey } from "../helpers/PeerID"
import { PeerDescriptor } from "../proto/DhtRpc"
import { ConnectionSourceEvents } from "./IConnectionSource"
import { SimulatorConnector } from "./SimulatorConnector"

export class Simulator extends EventEmitter<ConnectionSourceEvents> {
    private connectors: Map<PeerIDKey, SimulatorConnector> = new Map()
    private latenciesEnabled = false

    addConnector(connector: SimulatorConnector): void {
        this.connectors.set(PeerID.fromValue(connector.getPeerDescriptor().peerId).toKey(), connector)
    }

    send(sourceDescriptor: PeerDescriptor, targetDescriptor: PeerDescriptor, data: Uint8Array ): void {
        if (this.latenciesEnabled) {
            setTimeout(() => {
                this.connectors.get(PeerID.fromValue(targetDescriptor.peerId).toKey())!.handleIncomingData(sourceDescriptor, data)
            }
            , Math.random() * (250 - 5) + 5)
        } else {
            this.connectors.get(PeerID.fromValue(targetDescriptor.peerId).toKey())!.handleIncomingData(sourceDescriptor, data)
        }
    }

    enableLatencies(): void {
        this.latenciesEnabled = true
    }

    connect(sourceDescriptor: PeerDescriptor, targetDescriptor: PeerDescriptor): void  {
        const target = this.connectors.get(PeerID.fromValue(targetDescriptor.peerId).toKey())
        target!.handleIncomingConnection(sourceDescriptor)
    }

    disconnect(sourceDescriptor: PeerDescriptor, targetDescriptor: PeerDescriptor): void  {
        const target = this.connectors.get(PeerID.fromValue(targetDescriptor.peerId).toKey())
        target!.handleIncomingDisconnection(sourceDescriptor)
    }
}

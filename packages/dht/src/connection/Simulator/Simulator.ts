import EventEmitter from "eventemitter3"
import { PeerID, PeerIDKey } from "../../helpers/PeerID"
import { PeerDescriptor } from "../../proto/DhtRpc"
import { ConnectionSourceEvents } from "../IConnectionSource"
import { SimulatorConnector } from "./SimulatorConnector"
import { SimulatorConnection } from "./SimulatorConnection"
import { ConnectionID } from "../IConnection"
import { Logger } from "@streamr/utils"
import { getRegionDelayMatrix } from "../../../test/data/pings"

const logger = new Logger(module)

export enum LatencyType { NONE = 'NONE', RANDOM = 'RANDOM', REAL = 'REAL' }

export class Simulator extends EventEmitter<ConnectionSourceEvents> {
    private connectors: Map<PeerIDKey, SimulatorConnector> = new Map()
    private latencyTable?: Array<Array<number>>
    private associations: Map<ConnectionID, SimulatorConnection> = new Map()

    constructor(private latencyType: LatencyType = LatencyType.NONE) {
        super()
        if (this.latencyType == LatencyType.REAL) {
            this.latencyTable = getRegionDelayMatrix()
        }
    }

    private getLatency(sourceRegion: number | undefined, targetRegion: number | undefined): number {
        let latency: number = 0
        if (this.latencyType == LatencyType.REAL) {

            if (sourceRegion == undefined || targetRegion == undefined || sourceRegion > 15 || targetRegion > 15) {
                logger.error('invalid region index given to Simulator')
                throw ('invalid region index given to Simulator')
            }

            latency = this.latencyTable![sourceRegion!][targetRegion!]
        }
        if (this.latencyType == LatencyType.RANDOM) {
            latency = Math.random() * (250 - 5) + 5
        }

        return latency
    }

    accept(sourceConnection: SimulatorConnection, targetConnection: SimulatorConnection): void {
        this.associations.set(sourceConnection.connectionId, targetConnection)
        this.associations.set(targetConnection.connectionId, sourceConnection)
    }

    addConnector(connector: SimulatorConnector): void {
        this.connectors.set(PeerID.fromValue(connector.getPeerDescriptor().peerId).toKey(), connector)
    }

    connect(sourceConnection: SimulatorConnection, targetDescriptor: PeerDescriptor): Promise<void> {
        return new Promise((resolve, _reject) => {
            setTimeout(() => {
                const target = this.connectors.get(PeerID.fromValue(targetDescriptor.peerId).toKey())
                target?.handleIncomingConnection(sourceConnection)
                resolve()
            }, 5 * this.getLatency(sourceConnection.ownPeerDescriptor.region, targetDescriptor.region))
        })
    }

    disconnect(sourceConnection: SimulatorConnection): void {
        const target = this.associations.get(sourceConnection.connectionId)
        if (target) {
            setTimeout(() => {
                this.associations.delete(sourceConnection.connectionId)
                this.associations.delete(target!.connectionId)

                target!.handleIncomingDisconnection()
            }, this.getLatency(sourceConnection.ownPeerDescriptor.region, target!.ownPeerDescriptor.region))
        }
    }

    send(sourceConnection: SimulatorConnection, data: Uint8Array): void {
        const target = this.associations.get(sourceConnection.connectionId) //this.connectors.get(PeerID.fromValue(targetDescriptor.peerId).toKey())

        setTimeout(() => {
            target!.handleIncomingData(data)
        }, this.getLatency(sourceConnection.ownPeerDescriptor.region, target!.ownPeerDescriptor.region))
    }
}

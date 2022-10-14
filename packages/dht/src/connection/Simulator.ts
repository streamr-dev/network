import EventEmitter from "eventemitter3"
import { PeerID, PeerIDKey } from "../helpers/PeerID"
import { PeerDescriptor } from "../proto/DhtRpc"
import { ConnectionSourceEvents } from "./IConnectionSource"
import { SimulatorConnector } from "./SimulatorConnector"
import { Logger } from "@streamr/utils"
import { getRegionDelayMatrix } from "../../test/data/pings"

const logger = new Logger(module)

export enum LatencyType { NONE = 'NONE', RANDOM = 'RANDOM', REAL = 'REAL' }

export class Simulator extends EventEmitter<ConnectionSourceEvents> {
    private connectors: Map<PeerIDKey, SimulatorConnector> = new Map()
    private latencyTable?: Array<Array<number>>

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

    addConnector(connector: SimulatorConnector): void {
        this.connectors.set(PeerID.fromValue(connector.getPeerDescriptor().peerId).toKey(), connector)
    }

    connect(sourceDescriptor: PeerDescriptor, targetDescriptor: PeerDescriptor): void {
        const target = this.connectors.get(PeerID.fromValue(targetDescriptor.peerId).toKey())
        //target!.handleIncomingConnection(sourceDescriptor)
        
        setTimeout(() => {
            target!.handleIncomingConnection(sourceDescriptor)
        }, 2 * this.getLatency(sourceDescriptor.region, targetDescriptor.region))
        
    }

    disconnect(sourceDescriptor: PeerDescriptor, targetDescriptor: PeerDescriptor): void {
        const target = this.connectors.get(PeerID.fromValue(targetDescriptor.peerId).toKey())
        target!.handleIncomingDisconnection(sourceDescriptor)
        /*
        setTimeout(() => {
            target!.handleIncomingDisconnection(sourceDescriptor)
        }, this.getLatency(sourceDescriptor.region, targetDescriptor.region))
        */
    }

    send(sourceDescriptor: PeerDescriptor, targetDescriptor: PeerDescriptor, data: Uint8Array): void {
        const target = this.connectors.get(PeerID.fromValue(targetDescriptor.peerId).toKey())

        setTimeout(() => {
            target!.handleIncomingData(sourceDescriptor, data)
        }, this.getLatency(sourceDescriptor.region, targetDescriptor.region))
    }
}

import EventEmitter from "eventemitter3"
import { PeerID, PeerIDKey } from "../../helpers/PeerID"
import { PeerDescriptor } from "../../proto/packages/dht/protos/DhtRpc"
import { ConnectionSourceEvents } from "../IConnectionSource"
import { SimulatorConnector } from "./SimulatorConnector"
import { SimulatorConnection } from "./SimulatorConnection"
import { ConnectionID } from "../IConnection"
import { Logger, wait } from "@streamr/utils"
import { getRegionDelayMatrix } from "../../../test/data/pings"
import { v4 } from "uuid"

const logger = new Logger(module)

export enum LatencyType { NONE = 'NONE', RANDOM = 'RANDOM', REAL = 'REAL', FIXED = 'FIXED' }

export class Simulator extends EventEmitter<ConnectionSourceEvents> {
    private connectors: Map<PeerIDKey, SimulatorConnector> = new Map()
    private latencyTable?: Array<Array<number>>
    private associations: Map<ConnectionID, SimulatorConnection> = new Map()
    private connectAbortControllers: Map<string, AbortController> = new Map()
    private disconnectAbortControllers: Map<string, AbortController> = new Map()
    private sendAbortControllers: Map<string, AbortController> = new Map()

    constructor(private latencyType: LatencyType = LatencyType.NONE, private fixedLatency?: number) {
        super()
        if (this.latencyType == LatencyType.REAL) {
            this.latencyTable = getRegionDelayMatrix()
        }

        if (this.latencyType == LatencyType.FIXED && !this.fixedLatency) {
            throw new Error('LatencyType.FIXED requires the desired latency to be given as second parameter')
        }
    }

    private getLatency(sourceRegion: number | undefined, targetRegion: number | undefined): number {
        let latency: number = 0

        if (this.latencyType == LatencyType.FIXED) {
            latency = this.fixedLatency!
        }

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
        this.connectors.set(PeerID.fromValue(connector.getPeerDescriptor().kademliaId).toKey(), connector)
    }

    async connect(sourceConnection: SimulatorConnection, targetDescriptor: PeerDescriptor): Promise<void> {
        const target = this.connectors.get(PeerID.fromValue(targetDescriptor.kademliaId).toKey())

        const abortId = v4()
        const abortController = new AbortController()
        this.connectAbortControllers.set(abortId, abortController)

        await wait(5 * this.getLatency(sourceConnection.ownPeerDescriptor.region, targetDescriptor.region), abortController.signal)

        this.connectAbortControllers.delete(abortId)

        target!.handleIncomingConnection(sourceConnection)
    }

    async disconnect(sourceConnection: SimulatorConnection): Promise<void> {
        const target = this.associations.get(sourceConnection.connectionId)
        if (target) {

            const abortId = v4()
            const abortController = new AbortController()
            this.disconnectAbortControllers.set(abortId, abortController)

            await wait(this.getLatency(sourceConnection.ownPeerDescriptor.region, target!.ownPeerDescriptor.region), abortController.signal)

            this.disconnectAbortControllers.delete(abortId)

            this.associations.delete(sourceConnection.connectionId)
            this.associations.delete(target!.connectionId)

            target!.handleIncomingDisconnection()

        }
    }

    async send(sourceConnection: SimulatorConnection, data: Uint8Array): Promise<void> {
        const target = this.associations.get(sourceConnection.connectionId)

        const abortId = v4()
        const abortController = new AbortController()
        this.sendAbortControllers.set(abortId, abortController)

        await wait(this.getLatency(sourceConnection.ownPeerDescriptor.region, target!.ownPeerDescriptor.region), abortController.signal)

        this.sendAbortControllers.delete(abortId)

        target!.handleIncomingData(data)
    }

    stop(): void {
        logger.info('Stopping ' + this.connectAbortControllers.size + ' ongoing connect operations')
        this.connectAbortControllers.forEach((abortController) => {
            abortController.abort()
        })

        logger.info('Stopping ' + this.disconnectAbortControllers.size + ' ongoing disconnect operations')
        this.disconnectAbortControllers.forEach((abortController) => {
            abortController.abort()
        })

        logger.info('Stopping ' + this.sendAbortControllers.size + ' ongoing send operations')
        this.sendAbortControllers.forEach((abortController) => {
            abortController.abort()
        })
    }
}

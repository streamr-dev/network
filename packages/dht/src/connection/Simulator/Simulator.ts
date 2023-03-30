import EventEmitter from "eventemitter3"
import { PeerIDKey } from "../../helpers/PeerID"
import { PeerDescriptor } from "../../proto/packages/dht/protos/DhtRpc"
import { ConnectionSourceEvents } from "../IConnectionSource"
import { SimulatorConnector } from "./SimulatorConnector"
import { SimulatorConnection } from "./SimulatorConnection"
import { ConnectionID, ConnectionIDKey } from "../IConnection"
import { Logger } from "@streamr/utils"
import { getRegionDelayMatrix } from "../../../test/data/pings"
import { v4 } from "uuid"
import { keyFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'

const logger = new Logger(module)

export enum LatencyType { NONE = 'NONE', RANDOM = 'RANDOM', REAL = 'REAL', FIXED = 'FIXED' }

export class Simulator extends EventEmitter<ConnectionSourceEvents> {
    private stopped = false
    private connectors: Map<PeerIDKey, SimulatorConnector> = new Map()
    private latencyTable?: Array<Array<number>>
    private associations: Map<ConnectionID, SimulatorConnection> = new Map()

    private timeouts: Map<string, NodeJS.Timeout> = new Map()
    private timeoutsBySourceConnection: Map<ConnectionIDKey, string[]> = new Map()

    private latencyType: LatencyType
    private fixedLatency?: number

    constructor(latencyType: LatencyType = LatencyType.NONE, fixedLatency?: number) {
        super()
        this.latencyType = latencyType
        this.fixedLatency = fixedLatency

        if (this.latencyType == LatencyType.REAL) {
            this.latencyTable = getRegionDelayMatrix()
        }

        if (this.latencyType == LatencyType.FIXED && !this.fixedLatency) {
            throw new Error('LatencyType.FIXED requires the desired latency to be given as second parameter')
        }
    }

    private recordTimeoutBySourceConnection(sourceConnectionId: ConnectionIDKey, timeoutId: string) {
        if (!this.timeoutsBySourceConnection.has(sourceConnectionId)) {
            this.timeoutsBySourceConnection.set(sourceConnectionId, [])
        }

        this.timeoutsBySourceConnection.get(sourceConnectionId)!.push(timeoutId)
    }

    private clearTimeoutsBySourceConnection(sourceConnectionId: ConnectionIDKey) {
        const timeoutIds = this.timeoutsBySourceConnection.get(sourceConnectionId)
        if (timeoutIds) {
            // eslint-disable-next-line @typescript-eslint/prefer-for-of
            for (let i = 0; i < timeoutIds.length; i++) {
                const timeoutId = this.timeouts.get(timeoutIds[i])
                if (timeoutId) {
                    clearTimeout(timeoutId)
                    this.timeouts.delete(timeoutIds[i])
                }
            }
            this.timeoutsBySourceConnection.set(sourceConnectionId, [])
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
        this.connectors.set(keyFromPeerDescriptor(connector.getPeerDescriptor()), connector)
    }

    public connect(sourceConnection: SimulatorConnection, targetDescriptor: PeerDescriptor, connectedCallback: (error?: string) => void): void {
        
        if (this.stopped) {
            console.error('connect() called on a stopped simulator ' + (new Error().stack))
            return
        }

        const target = this.connectors.get(keyFromPeerDescriptor(targetDescriptor))

        if (!target) {
            return connectedCallback('Traget connector not found')
        }
        
        const timeoutId = v4()
        const latency = 5 * this.getLatency(sourceConnection.ownPeerDescriptor.region, targetDescriptor.region)
        
        const timeout = setTimeout(() => {
            this.timeouts.delete(timeoutId)

            logger.trace('connect() calling hadleIncomingConnection() ')
            
            target!.handleIncomingConnection(sourceConnection)
        
            connectedCallback()

        }, latency)

        this.timeouts.set(timeoutId, timeout)
        this.recordTimeoutBySourceConnection(sourceConnection.connectionId.toMapKey(), timeoutId)
    }

    async disconnect(sourceConnection: SimulatorConnection): Promise<void> {
        if (this.stopped) {
            console.error('disconnect() called on a stopped simulator ' + (new Error().stack))
            return
        }

        this.clearTimeoutsBySourceConnection(sourceConnection.connectionId.toMapKey())
        
        const target = this.associations.get(sourceConnection.connectionId)
        if (target) {

            const timeoutId = v4()
            const latency = this.getLatency(sourceConnection.ownPeerDescriptor.region, target!.ownPeerDescriptor.region)
            const timeout = setTimeout(() => {
                this.timeouts.delete(timeoutId)

                logger.trace('disconnect() calling hadleIncomingDisconnection()')

                this.associations.delete(sourceConnection.connectionId)
                this.associations.delete(target!.connectionId)
                target!.handleIncomingDisconnection()
            }, latency)

            this.timeouts.set(timeoutId, timeout)
        }
    }
  
    public send(sourceConnection: SimulatorConnection, data: Uint8Array): void {
        if (this.stopped) {
            console.error('send() called on a stopped simulator ' + (new Error().stack))
            return
        }

        const target = this.associations.get(sourceConnection.connectionId)

        logger.trace('send()')

        if (target) {
            const timeoutId = v4()
            const latency = this.getLatency(sourceConnection.ownPeerDescriptor.region, target!.ownPeerDescriptor.region)
            const timeout = setTimeout(() => {
                this.timeouts.delete(timeoutId)
                logger.trace('send() calling handleIncomingData()')
                target!.handleIncomingData(data)
            }, latency)

            this.timeouts.set(timeoutId, timeout)
        }
    }

    stop(): void {
        this.stopped = true
        logger.info(this.associations.size + ' associations in the beginning of stop()')
        this.timeouts.forEach((timeoutref) => {
            clearTimeout(timeoutref)
        })
    }
}

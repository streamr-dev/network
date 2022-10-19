import { PeerID, PeerIDKey } from "../helpers/PeerID"
import { Message, PeerDescriptor } from "../proto/DhtRpc"
import { SimulatorTransport } from "./SimulatorTransport"
import { Logger } from "@streamr/utils"
import { getRegionDelayMatrix } from "../../test/data/pings"

const logger = new Logger(module)

export enum LatencyType { NONE = 'NONE', RANDOM = 'RANDOM', REAL = 'REAL' }

export class Simulator {

    private connectionManagers: Map<PeerIDKey, SimulatorTransport> = new Map()

    private latencyTable?: Array<Array<number>>

    constructor(private latencyType: LatencyType = LatencyType.NONE) {
        if (this.latencyType == LatencyType.REAL) {
            this.latencyTable = getRegionDelayMatrix()
        }
    }

    addConnectionManager(manager: SimulatorTransport): void {
        this.connectionManagers.set(PeerID.fromValue(manager.getPeerDescriptor().peerId).toKey(), manager)
    }

    send(sourceDescriptor: PeerDescriptor, targetDescriptor: PeerDescriptor, msg: Message): void {

        if (this.latencyType == LatencyType.NONE) {
            this.connectionManagers.get(PeerID.fromValue(targetDescriptor.peerId).toKey())!.handleIncomingMessage(sourceDescriptor, msg)
        } else {
            let latency: number = 0
            if (this.latencyType == LatencyType.REAL) {
                const sourceRegion = sourceDescriptor.region
                const targetRegion = targetDescriptor.region

                if (sourceRegion == undefined || targetRegion == undefined || sourceRegion > 15 || targetRegion > 15) {
                    logger.error('invalid region index given to Simulator')
                    throw ('invalid region index given to Simulator')
                }

                latency = this.latencyTable![sourceRegion!][targetRegion!]
                logger.info('Using latency' + latency)

            } else {
                latency = Math.random() * (250 - 5) + 5
            }

            setTimeout(() => {
                this.connectionManagers.get(PeerID.fromValue(targetDescriptor.peerId).toKey())!.handleIncomingMessage(sourceDescriptor, msg)
            }, latency)
        }
    }
}

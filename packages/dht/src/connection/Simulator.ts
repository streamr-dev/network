import { PeerID, PeerIDKey } from "../helpers/PeerID"
import { Message, PeerDescriptor } from "../proto/DhtRpc"
import { SimulatorTransport } from "./SimulatorTransport"
import { readFileSync } from 'fs'
import { Logger } from "@streamr/utils"

const logger = new Logger(module)

export function getRandomRegion(): number {
    return Math.floor(Math.random() * 15)
}

export enum LatencyType { NONE = 'NONE', RANDOM = 'RANDOM', REAL = 'REAL' }

export class Simulator {

    private connectionManagers: Map<PeerIDKey, SimulatorTransport> = new Map()

    private latencyTable?: Array<Array<number>>

    constructor(private latencyType: LatencyType = LatencyType.NONE) {
        if (this.latencyType == LatencyType.REAL) {
            this.latencyTable = this.loadRealLatencies()
        }
    }

    private loadRealLatencies(): Array<Array<number>> {
        const realLatencies: Array<Array<number>> = []

        const data = readFileSync('./test/data/pings.csv', 'utf-8').toString().split('\n')
        const rows: Array<Array<string>> = []

        for (let i = 1; i < data.length; i++) {
            rows.push(data[i].split(','))
        }

        // eslint-disable-next-line @typescript-eslint/prefer-for-of
        for (let i = 0; i < rows.length; i++) {
            const latencyRow: Array<number> = []
            for (let j = 1; j < rows[i].length; j++) {
                latencyRow.push(parseFloat(rows[i][j]) / 2)
            }
            realLatencies.push(latencyRow)
        }

        return realLatencies
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

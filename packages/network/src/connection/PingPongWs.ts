import { Logger } from "../helpers/Logger"
import { Rtts } from "../identifiers"
import { SharedConnection } from "./AbstractWsEndpoint"

export type GetConnections = () => Array<SharedConnection>

const logger = new Logger(module)

export class PingPongWs {
    private readonly pingInterval: NodeJS.Timeout
    private readonly getConnections: GetConnections

    constructor(getConnections: GetConnections, pingIntervalInMs: number) {
        this.getConnections = getConnections
        this.pingInterval = setInterval(() => this.pingConnections(), pingIntervalInMs)
    }

    onPong(connection: SharedConnection): void {
        connection.respondedPong = true
        connection.rtt = Date.now() - connection.rttStart!
    }

    getRtts(): Rtts {
        const rtts: Rtts = {}
        this.getConnections().forEach((connection) => {
            if (connection.rtt !== undefined) {
                rtts[connection.getPeerId()] = connection.rtt
            }
        })
        return rtts
    }

    stop(): void {
        clearInterval(this.pingInterval)
    }

    private pingConnections(): void {
        this.getConnections().forEach((connection) => {
            try {
                // didn't get "pong" in pingInterval
                if (!connection.respondedPong) {
                    throw new Error('ws is not active')
                }

                // eslint-disable-next-line no-param-reassign
                connection.respondedPong = false
                connection.rttStart = Date.now()
                connection.ping()
                logger.trace('pinging %s (current rtt %s)', connection.getPeerId(), connection.rtt)
            } catch (e) {
                logger.warn(`failed pinging %s, error %s, terminating connection`, connection.getPeerId(), e)
                connection.terminate()
            }
        })
    }
}
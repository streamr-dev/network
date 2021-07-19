import { Logger } from "../../helpers/Logger"
import { Rtts } from "../../identifiers"
import { WsConnection } from "./WsConnection"

export type GetConnections = () => Array<WsConnection>

const logger = new Logger(module)

export class PingPongWs {
    private readonly pingInterval: NodeJS.Timeout
    private readonly getConnections: GetConnections

    constructor(getConnections: GetConnections, pingIntervalInMs: number) {
        this.getConnections = getConnections
        this.pingInterval = setInterval(() => this.pingConnections(), pingIntervalInMs)
    }

    getRtts(): Rtts {
        const rtts: Rtts = {}
        this.getConnections().forEach((connection) => {
            const rtt = connection.getRtt()
            if (rtt !== undefined) {
                rtts[connection.getPeerId()] = rtt
            }
        })
        return rtts
    }

    stop(): void {
        clearInterval(this.pingInterval)
    }

    private pingConnections(): void {
        this.getConnections().forEach((connection) => {
            if (!connection.getRespondedPong()) {
                logger.warn(`terminate connection to %s because didn't receive pong`, connection.getPeerId())
                connection.terminate()
            } else {
                try {
                    connection.ping()
                    logger.trace('pinging %s (current rtt %s)', connection.getPeerId(), connection.getRtt())
                } catch (e) {
                    logger.warn(`terminating connection because error thrown when attempting to ping %s: %s`,
                        connection.getPeerId(), e)
                    connection.terminate()
                }
            }
        })
    }
}
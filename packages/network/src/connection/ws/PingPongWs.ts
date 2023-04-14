import { Logger } from "@streamr/utils"
import { Rtts } from "../../identifiers"
import { AbstractWsConnection } from "./AbstractWsConnection"

export type GetConnections = () => Array<AbstractWsConnection>

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
                logger.warn({ peerId: connection.getPeerId() }, 'terminating connection due to not receiving pong')
                connection.terminate()
            } else {
                try {
                    connection.ping()
                    logger.trace({
                        peerId: connection.getPeerId(),
                        rtt: connection.getRtt()
                    }, 'ping sent')
                } catch (err) {
                    logger.warn({
                        peerId: connection.getPeerId(),
                        err
                    }, `terminating connection due to error thrown when attempting to ping`,)
                    connection.terminate()
                }
            }
        })
    }
}

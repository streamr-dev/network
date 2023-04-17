import { Logger } from "@streamr/utils"
import { Rtts } from "../../identifiers"
import { AbstractWsConnection } from "./AbstractWsConnection"

export type GetConnections = () => Array<AbstractWsConnection>

const logger = new Logger(module)

export class PingPongWs {
    private readonly pingIntervalInMs: number
    private readonly pingInterval: NodeJS.Timeout
    private readonly getConnections: GetConnections

    constructor(getConnections: GetConnections, pingIntervalInMs: number) {
        this.getConnections = getConnections
        this.pingIntervalInMs = pingIntervalInMs
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
                logger.warn('Terminate connection (did not receive pong response in time)', {
                    peerId: connection.getPeerId(),
                    pingIntervalInMs: this.pingIntervalInMs
                })
                connection.terminate()
            } else {
                try {
                    connection.ping()
                    logger.trace('Sent ping', {
                        peerId: connection.getPeerId(),
                        rtt: connection.getRtt()
                    })
                } catch (err) {
                    logger.warn('Terminate connection (error thrown when attempting to ping)', {
                        peerId: connection.getPeerId(),
                        err
                    })
                    connection.terminate()
                }
            }
        })
    }
}

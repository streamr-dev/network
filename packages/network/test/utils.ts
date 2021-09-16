import { MetricsContext } from '../src/composition'
import { PeerInfo } from '../src/connection/PeerInfo'
import { ServerWsEndpoint, startHttpServer } from '../src/connection/ws/ServerWsEndpoint'

export const startServerWsEndpoint = async (
    host: string,
    port: number,
    peerInfo: PeerInfo,
    metricsContext?: MetricsContext,
    pingInterval?: number | undefined
): Promise<ServerWsEndpoint> => {
    const listenConfig = {
        hostname: host,
        port: port
    }
    const httpServer = await startHttpServer(listenConfig, undefined, undefined)
    return  new ServerWsEndpoint(listenConfig, false, httpServer, peerInfo, metricsContext, pingInterval)
}
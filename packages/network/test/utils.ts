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
    const httpServer = await startHttpServer(host, port, undefined, undefined)
    return  new ServerWsEndpoint(host, port, false, httpServer, peerInfo, metricsContext, pingInterval)
}
import { MetricsContext } from '../src/composition'
import { PeerInfo } from '../src/connection/PeerInfo'
import { ServerWsEndpoint, startWebSocketServer } from '../src/connection/ws/ServerWsEndpoint'

export const startServerWsEndpoint = async (
    host: string,
    port: number,
    peerInfo: PeerInfo,
    metricsContext?: MetricsContext,
    pingInterval?: number | undefined
): Promise<ServerWsEndpoint> => {
    const [wss, listenSocket] = await startWebSocketServer(host, port, undefined, undefined)
    return  new ServerWsEndpoint(host, port, wss, listenSocket, peerInfo, metricsContext, pingInterval)
}
import { v4 as uuidv4 } from 'uuid'
import { TopologyStabilizationOptions, Tracker } from './logic/Tracker'
import { TrackerServer } from './protocol/TrackerServer'
import { trackerHttpEndpoints } from './logic/trackerHttpEndpoints'
import {
    AbstractNodeOptions,
    HttpServerConfig,
    MetricsContext,
    PeerInfo,
    ServerWsEndpoint,
    startHttpServer,
    DEFAULT_MAX_NEIGHBOR_COUNT
} from 'streamr-network'

export interface TrackerOptions extends AbstractNodeOptions {
    listen: HttpServerConfig
    attachHttpEndpoints?: boolean
    maxNeighborsPerNode?: number
    privateKeyFileName?: string
    certFileName?: string,
    topologyStabilization?: TopologyStabilizationOptions
}

export const startTracker = async ({
    listen,
    id = uuidv4(),
    location,
    attachHttpEndpoints = true,
    maxNeighborsPerNode = DEFAULT_MAX_NEIGHBOR_COUNT,
    metricsContext = new MetricsContext(),
    trackerPingInterval,
    privateKeyFileName,
    certFileName,
    topologyStabilization
}: TrackerOptions): Promise<Tracker> => {
    const peerInfo = PeerInfo.newTracker(id, undefined, undefined, location)
    const httpServer = await startHttpServer(listen, privateKeyFileName, certFileName)
    const endpoint = new ServerWsEndpoint(listen, privateKeyFileName !== undefined, httpServer, peerInfo, trackerPingInterval)

    const tracker = new Tracker({
        peerInfo,
        protocols: {
            trackerServer: new TrackerServer(endpoint)
        },
        metricsContext,
        maxNeighborsPerNode,
        topologyStabilization
    })

    if (attachHttpEndpoints) {
        trackerHttpEndpoints(httpServer, tracker, metricsContext)
    }

    return tracker
}

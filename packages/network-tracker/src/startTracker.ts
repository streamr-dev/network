import { v4 as uuidv4 } from 'uuid'
import { MetricsContext } from '../../network/src/helpers/MetricsContext'
import { PeerInfo } from '../../network/src/connection/PeerInfo'
import { HttpServerConfig, ServerWsEndpoint, startHttpServer } from '../../network/src/connection/ws/ServerWsEndpoint'
import { TopologyStabilizationOptions, Tracker } from './logic/Tracker'
import { DEFAULT_MAX_NEIGHBOR_COUNT } from './logic/config'
import { TrackerServer } from './protocol/TrackerServer'
import { trackerHttpEndpoints } from './logic/trackerHttpEndpoints'
import { AbstractNodeOptions } from '../../network/src/identifiers'

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
    name,
    location,
    attachHttpEndpoints = true,
    maxNeighborsPerNode = DEFAULT_MAX_NEIGHBOR_COUNT,
    metricsContext = new MetricsContext(id),
    trackerPingInterval,
    privateKeyFileName,
    certFileName,
    topologyStabilization
}: TrackerOptions): Promise<Tracker> => {
    const peerInfo = PeerInfo.newTracker(id, name, undefined, undefined, location)
    const httpServer = await startHttpServer(listen, privateKeyFileName, certFileName)
    const endpoint = new ServerWsEndpoint(listen, privateKeyFileName !== undefined, httpServer, peerInfo, metricsContext, trackerPingInterval)

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

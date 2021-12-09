import { Wallet, utils } from 'ethers'
import { MetricsContext } from './helpers/MetricsContext'
import { PeerInfo } from './connection/PeerInfo'
import { HttpServerConfig, ServerWsEndpoint, startHttpServer } from './connection/ws/ServerWsEndpoint'
import { TopologyStabilizationOptions, Tracker } from './logic/tracker/Tracker'
import { DEFAULT_MAX_NEIGHBOR_COUNT } from './logic/tracker/config'
import { TrackerServer } from './protocol/TrackerServer'
import { trackerHttpEndpoints } from './logic/tracker/trackerHttpEndpoints'
import { AbstractNodeOptions } from './identifiers'

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
    id = Wallet.createRandom().address,
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
    if (!utils.isAddress(id)) {
        throw new Error(`Invalid tracker id: ${id}`)
    }
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

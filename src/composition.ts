import { v4 as uuidv4 } from 'uuid'
import * as Protocol from "streamr-client-protocol"
import { MetricsContext } from "./helpers/MetricsContext"
import { Location } from "./identifiers"
import { PeerInfo } from "./connection/PeerInfo"
import { startEndpoint } from "./connection/WsEndpoint"
import { Tracker } from "./logic/Tracker"
import { TrackerServer } from "./protocol/TrackerServer"
import { trackerHttpEndpoints } from "./helpers/trackerHttpEndpoints"
import getLogger from "./helpers/logger"
import { TrackerNode } from "./protocol/TrackerNode"
import { RtcSignaller } from "./logic/RtcSignaller"
import { WebRtcEndpoint } from "./connection/WebRtcEndpoint"
import { NodeToNode } from "./protocol/NodeToNode"
import { NetworkNode } from "./NetworkNode"
import { Readable } from "stream"

const STUN_URLS = ['stun:stun.l.google.com:19302'] // TODO: make configurable

const logger = getLogger("streamr:bin:composition")

export {
    Location,
    MetricsContext,
    NetworkNode,
    Protocol,
    Tracker
}

export interface Storage {
    requestLast(
        streamId: string,
        streamPartition: number,
        numberLast: number
    ): Readable

    requestFrom(
        streamId: string,
        streamPartition: number,
        fromTimestamp: number,
        fromSequenceNumber: number,
        publisherId: string | null,
        msgChainId: string | null
    ): Readable

    requestRange(
        streamId: string,
        streamPartition: number,
        fromTimestamp: number,
        fromSequenceNumber: number,
        toTimestamp: number,
        toSequenceNumber: number,
        publisherId: string | null,
        msgChainId: string | null
    ): Readable

    store(msg: Protocol.MessageLayer.StreamMessage): void
}

export interface TrackerOptions {
    host: string
    port: number
    id?: string
    name?: string
    location?: Location | null
    attachHttpEndpoints?: boolean
    maxNeighborsPerNode?: number
    advertisedWsUrl?: string | null
    metricsContext?: MetricsContext
    pingInterval?: number
    privateKeyFileName?: string
    certFileName?: string
}

export interface NetworkNodeOptions {
    host: string,
    port: number,
    trackers: string[],
    id?: string,
    name?: string,
    location?: Location | null
    storages?: Storage[],
    advertisedWsUrl?: string | null
    metricsContext?: MetricsContext
    pingInterval?: number,
    disconnectionWaitTime?: number,
    newWebrtcConnectionTimeout?: number
}

export function startTracker({
    host,
    port,
    id = uuidv4(),
    name,
    location,
    attachHttpEndpoints = true,
    maxNeighborsPerNode = 4,
    advertisedWsUrl = null,
    metricsContext = new MetricsContext(id),
    pingInterval,
    privateKeyFileName,
    certFileName,
}: TrackerOptions): Promise<Tracker> {
    const peerInfo = PeerInfo.newTracker(id, name, location)
    return startEndpoint(
        host,
        port,
        peerInfo,
        advertisedWsUrl,
        metricsContext,
        pingInterval,
        privateKeyFileName,
        certFileName
    ).then((endpoint) => {
        const tracker = new Tracker({
            peerInfo,
            protocols: {
                trackerServer: new TrackerServer(endpoint)
            },
            metricsContext,
            maxNeighborsPerNode,
        })

        if (attachHttpEndpoints) {
            logger.debug('attaching HTTP endpoints to the tracker on port %s', port)
            trackerHttpEndpoints(endpoint.getWss(), tracker, metricsContext)
        }

        return tracker
    })
}

export function startNetworkNode(opts: NetworkNodeOptions): Promise<NetworkNode> {
    return startNode(opts, PeerInfo.newNode)
}

export function startStorageNode(opts: NetworkNodeOptions): Promise<NetworkNode> {
    return startNode(opts, PeerInfo.newStorage)
}

function startNode({
   host,
   port,
   id = uuidv4(),
   name,
   location,
   trackers,
   storages = [],
   advertisedWsUrl  = null,
   metricsContext = new MetricsContext(id),
   pingInterval,
   disconnectionWaitTime,
   newWebrtcConnectionTimeout
}: NetworkNodeOptions, peerInfoFn: (id: string, name: string | undefined, location: Location | null | undefined) => PeerInfo): Promise<NetworkNode> {
    const peerInfo = peerInfoFn(id, name, location)
    return startEndpoint(host, port, peerInfo, advertisedWsUrl, metricsContext, pingInterval).then((endpoint) => {
        const trackerNode = new TrackerNode(endpoint)
        const webRtcSignaller = new RtcSignaller(peerInfo, trackerNode)
        const nodeToNode = new NodeToNode(new WebRtcEndpoint(id, STUN_URLS, webRtcSignaller, metricsContext, pingInterval, newWebrtcConnectionTimeout))
        return new NetworkNode({
            peerInfo,
            trackers,
            protocols: {
                trackerNode,
                nodeToNode
            },
            metricsContext,
            storages,
            disconnectionWaitTime
        })
    })
}

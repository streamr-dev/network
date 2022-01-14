import { StreamPartID, StreamID, StreamPartIDUtils, toStreamPartID } from 'streamr-client-protocol'
import { NodeId } from '../node/Node'
import { OverlayPerStream, OverlayConnectionRtts } from './Tracker'
import { Location } from '../../identifiers'

type OverLayWithRtts = Record<StreamPartID, Record<NodeId,{ neighborId: NodeId, rtt: number | null }[] >>
type OverlaySizes = { streamId: string, partition: number, nodeCount: number }[]
type NodesWithLocations = { [key: string]: Location }

export function getTopology(
    overlayPerStream: OverlayPerStream,
    connectionRtts: OverlayConnectionRtts,
    streamId: StreamID | null = null,
    partition: number | null = null
): OverLayWithRtts {
    const topology: OverLayWithRtts = {}

    const streamPartIds = findStreamPartIDs(overlayPerStream, streamId, partition)
    streamPartIds.forEach((streamPartId) => {
        const streamOverlay = overlayPerStream[streamPartId].state()
        topology[streamPartId] = Object.assign({}, ...Object.entries(streamOverlay).map(([nodeId, neighbors]) => {
            return addRttsToNodeConnections(nodeId, neighbors, connectionRtts)
        }))
    })

    return topology
}

export function getStreamSizes(overlayPerStream: OverlayPerStream, streamId: StreamID | null = null, partition: number | null = null): OverlaySizes {
    const streamPartIds = findStreamPartIDs(overlayPerStream, streamId, partition)
    const streamSizes: OverlaySizes = streamPartIds.map((streamPartId) => {
        const [streamId, partition] = StreamPartIDUtils.getStreamIDAndStreamPartition(streamPartId)
        return {
            streamId,
            partition,
            nodeCount: overlayPerStream[streamPartId].getNumberOfNodes()
        }
    })
    return streamSizes
}

export function getNodeConnections(nodes: readonly NodeId[], overlayPerStream: OverlayPerStream): Record<NodeId,Set<NodeId>> {
    const result: Record<NodeId,Set<NodeId>> = {}
    nodes.forEach((node) => {
        result[node] = new Set<NodeId>()
    })
    Object.values(overlayPerStream).forEach((overlayTopology) => {
        Object.entries(overlayTopology.getNodes()).forEach(([nodeId, neighbors]) => {
            neighbors.forEach((neighborNode) => {
                if (!(nodeId in result)) {
                    result[nodeId] = new Set<NodeId>()
                }
                result[nodeId].add(neighborNode)
            })
        })
    })
    return result
}

export function addRttsToNodeConnections(
    nodeId: NodeId,
    neighbors: Array<NodeId>,
    connectionRtts: OverlayConnectionRtts
): Record<NodeId,{ neighborId: NodeId, rtt: number | null }[]> {
    return {
        [nodeId]: neighbors.map((neighborId) => {
            return {
                neighborId,
                rtt: getNodeToNodeConnectionRtts(nodeId, neighborId, connectionRtts[nodeId], connectionRtts[neighborId])
            }
        })
    }
}

export function getNodesWithLocationData(nodes: ReadonlyArray<string>, locations: Readonly<{[key: string]: Location}>): NodesWithLocations {
    return Object.assign({}, ...nodes.map((nodeId: string) => {
        return {
            [nodeId]: locations[nodeId] || {
                latitude: null,
                longitude: null,
                country: null,
                city: null,
            }
        }
    }))
}

export function findStreamsForNode(
    overlayPerStream: OverlayPerStream,
    nodeId: NodeId
): Array<{ streamId: string, partition: number, topologySize: number}> {
    return Object.entries(overlayPerStream)
        .filter(([_, overlayTopology]) => overlayTopology.hasNode(nodeId))
        .map(([streamPartId, overlayTopology]) => {
            const [streamId, partition] = StreamPartIDUtils.getStreamIDAndStreamPartition(streamPartId as StreamPartID)
            return {
                streamId,
                partition,
                topologySize: overlayTopology.getNumberOfNodes()
            }
        })
}

function getNodeToNodeConnectionRtts(
    nodeOne: NodeId,
    nodeTwo: NodeId,
    nodeOneRtts: Record<NodeId,number>,
    nodeTwoRtts: Record<NodeId,number>
): number | null {
    try {
        return nodeOneRtts[nodeTwo] || nodeTwoRtts[nodeOne] || null
    } catch (err) {
        return null
    }
}

function findStreamPartIDs(overlayPerStream: OverlayPerStream, streamId: StreamID | null = null, partition: number | null = null): StreamPartID[] {
    if (streamId === null) {
        return Object.keys(overlayPerStream) as StreamPartID[]
    } else if (partition === null) {
        return Object.keys(overlayPerStream)
            .filter((streamPartId) => streamPartId.includes(streamId)) as StreamPartID[]
    } else {
        const targetStreamPartId = toStreamPartID(streamId, partition)
        return Object.keys(overlayPerStream)
            .filter((candidateStreamPartId) => targetStreamPartId === candidateStreamPartId) as StreamPartID[]
    }
}

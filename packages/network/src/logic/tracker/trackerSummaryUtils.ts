import { SPID, SPIDKey } from 'streamr-client-protocol'
import { NodeId } from '../node/Node'
import { OverlayPerStream, OverlayConnectionRtts } from './Tracker'

type OverLayWithRtts = Record<SPIDKey,Record<NodeId,{ neighborId: NodeId, rtt: number | null }[] >>
type OverlaySizes = { streamId: string, partition: number, nodeCount: number }[]

export function getTopology(
    overlayPerStream: OverlayPerStream,
    connectionRtts: OverlayConnectionRtts,
    streamId: string | null = null,
    partition: number | null = null
): OverLayWithRtts {
    const topology: OverLayWithRtts = {}

    const spidKeys = findSPIDKeys(overlayPerStream, streamId, partition)
    spidKeys.forEach((spidKey) => {
        const streamOverlay = overlayPerStream[spidKey].state()
        topology[spidKey] = Object.assign({}, ...Object.entries(streamOverlay).map(([nodeId, neighbors]) => {
            return addRttsToNodeConnections(nodeId, neighbors, connectionRtts)
        }))
    })

    return topology
}

export function getSPIDSizes(overlayPerStream: OverlayPerStream, streamId: string | null = null, partition: number | null = null): OverlaySizes {
    const spidKeys = findSPIDKeys(overlayPerStream, streamId, partition)
    const spidSizes: OverlaySizes = spidKeys.map((spidKey) => {
        const spid = SPID.from(spidKey)
        return {
            streamId: spid.streamId,
            partition: spid.streamPartition,
            nodeCount: overlayPerStream[spidKey].getNumberOfNodes()
        }
    })
    return spidSizes
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

export function findSPIDsForNode(
    overlayPerStream: OverlayPerStream,
    nodeId: NodeId
): Array<{ streamId: string, partition: number, topologySize: number}> {
    return Object.entries(overlayPerStream)
        .filter(([_, overlayTopology]) => overlayTopology.hasNode(nodeId))
        .map(([spidKey, overlayTopology]) => {
            const spid = SPID.from(spidKey)
            return {
                streamId: spid.streamId,
                partition: spid.streamPartition,
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

function findSPIDKeys(overlayPerStream: OverlayPerStream, streamId: string | null = null, partition: number | null = null): string[] {
    let keys

    if (streamId && partition === null) {
        keys = Object.keys(overlayPerStream).filter((spidKey) => spidKey.includes(streamId))
    } else {
        let askedKey: SPID | null = null
        if (streamId && partition != null && Number.isSafeInteger(partition) && partition >= 0) {
            askedKey = new SPID(streamId, partition)
        }

        keys = askedKey
            ? Object.keys(overlayPerStream).filter((spidKey) => spidKey === askedKey!.toString())
            : Object.keys(overlayPerStream)
    }

    return keys
}

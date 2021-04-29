import { StreamIdAndPartition } from '../identifiers'
import { OverlayPerStream, OverlayConnectionRtts } from './Tracker'

type OverLayWithRtts = { [key: string]: { [key: string]: { neighborId: string, rtt: number | null }[] } }
type OverlaySizes = { streamId: string, partition: number, nodeCount: number }[]

export function getTopology(
    overlayPerStream: OverlayPerStream,
    connectionRtts: OverlayConnectionRtts,
    streamId: string | null = null,
    partition: number | null = null
): OverLayWithRtts {
    const topology: OverLayWithRtts = {}

    const streamKeys = findStreamKeys(overlayPerStream, streamId, partition)

    streamKeys.forEach((streamKey) => {
        const streamOverlay = overlayPerStream[streamKey].state()
        topology[streamKey] = Object.assign({}, ...Object.entries(streamOverlay).map(([nodeId, neighbors]) => {
            return addRttsToNodeConnections(nodeId, neighbors, connectionRtts)
        }))
    })

    return topology
}

export function getStreamSizes(overlayPerStream: OverlayPerStream, streamId: string | null = null, partition: number | null = null): OverlaySizes {
    const streamKeys = findStreamKeys(overlayPerStream, streamId, partition)

    const streamSizes: OverlaySizes = streamKeys.map((streamKey) => {
        const key = StreamIdAndPartition.fromKey(streamKey)
        return {
            streamId: key.id,
            partition: key.partition,
            nodeCount: overlayPerStream[streamKey].getNumberOfNodes()
        }
    })
    return streamSizes
}

export function getNodeConnections(nodes: readonly string[], overlayPerStream: OverlayPerStream): { [key: string]: Set<string> } {
    const result: { [key: string]: Set<string> } = {}
    nodes.forEach((node) => {
        result[node] = new Set<string>()
    })
    nodes.forEach((node) => {
        Object.values(overlayPerStream).forEach((overlayTopology) => {
            result[node] = new Set([...result[node], ...overlayTopology.getNeighbors(node)])
        })
    })
    return result
}

export function addRttsToNodeConnections(nodeId: string, neighbors: Array<string>, connectionRtts: OverlayConnectionRtts): { [key: string]: { neighborId: string, rtt: number | null }[] } {
    return {
        [nodeId]: neighbors.map((neighborId) => {
            return {
                neighborId,
                rtt: getNodeToNodeConnectionRtts(nodeId, neighborId, connectionRtts[nodeId], connectionRtts[neighborId])
            }
        })
    }
}

function getNodeToNodeConnectionRtts(nodeOne: string, nodeTwo: string, nodeOneRtts: { [key: string]: number }, nodeTwoRtts: { [key: string]: number }): number | null {
    try {
        return nodeOneRtts[nodeTwo] || nodeTwoRtts[nodeOne] || null
    } catch (err) {
        return null
    }
}

function findStreamKeys(overlayPerStream: OverlayPerStream, streamId: string | null = null, partition: number | null = null): string[] {
    let streamKeys

    if (streamId && partition === null) {
        streamKeys = Object.keys(overlayPerStream).filter((streamKey) => streamKey.includes(streamId))
    } else {
        let askedStreamKey: StreamIdAndPartition | null = null
        if (streamId && partition != null && Number.isSafeInteger(partition) && partition >= 0) {
            askedStreamKey = new StreamIdAndPartition(streamId, partition)
        }

        streamKeys = askedStreamKey
            ? Object.keys(overlayPerStream).filter((streamKey) => streamKey === askedStreamKey!.toString())
            : Object.keys(overlayPerStream)
    }

    return streamKeys
}
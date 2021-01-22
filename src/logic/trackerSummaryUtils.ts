import { TopologyState } from './OverlayTopology'
import { StreamIdAndPartition } from '../identifiers'
import { OverlayPerStream } from './Tracker'

export function getTopology(
    overlayPerStream: OverlayPerStream,
    streamId: string | null = null,
    partition: number | null = null
): { [key: string]: TopologyState } {
    const topology: { [key: string]: TopologyState } = {}

    let streamKeys: string[] = []

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

    streamKeys.forEach((streamKey) => {
        topology[streamKey] = overlayPerStream[streamKey].state()
    })

    return topology
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

import { OverlayTopology, TopologyNodes, TopologyState } from "./OverlayTopology"
import { StreamIdAndPartition } from "../identifiers"

export function getTopology(
    overlayPerStream: { [key: string]: OverlayTopology},
    streamId: string | null = null,
    partition: number | null = null
): { [key: string]: TopologyState } {
    const topology: { [key: string]: TopologyState } = {}

    let streamKeys = []

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

export function getTopologyUnion(overlayPerStream: { [key: string]: OverlayTopology}): Readonly<TopologyNodes> {
    // merges each source value (a Set object) into the target value with the same key
    const mergeSetMapInto = (target: TopologyNodes, source: TopologyNodes) => {
        Object.keys(source).forEach((key) => {
            const sourceSet = source[key]
            const targetSet = target[key]
            const mergedSet = (targetSet !== undefined) ? new Set([...targetSet, ...sourceSet]) : sourceSet
            target[key] = mergedSet
        })
        return target
    }
    const nodeMaps = Object.values(overlayPerStream).map((topology) => topology.getNodes())
    return nodeMaps.reduce((accumulator, current) => mergeSetMapInto(accumulator, current), {})
}

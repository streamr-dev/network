import { Multimap } from '@streamr/utils'
import { DhtAddress, randomDhtAddress, toDhtAddressRaw } from '../../src/identifiers'
import { minBy, range, without } from 'lodash'
import { SortedContactList } from '../../src/dht/contact/SortedContactList'
import { getDistance } from '../../src/dht/PeerManager'

export const getTopologyPartitions = (topology: Multimap<DhtAddress, DhtAddress>): Set<DhtAddress>[] => {
    let partitions: Set<DhtAddress>[] = []
    for (const nodeId of topology.keys()) {
        const neighbors = topology.get(nodeId)
        const existingPartition = partitions.find((partition) => partition.has(nodeId))
        if (existingPartition !== undefined) {
            for (const neighbor of neighbors) {
                if (!existingPartition.has(neighbor)) {
                    const otherPartition = partitions.find((partition) => partition.has(neighbor))
                    if (otherPartition !== undefined) {
                        for (const otherNode of otherPartition) {
                            existingPartition.add(otherNode)
                        }
                        partitions = without(partitions, otherPartition)
                    } else {
                        existingPartition.add(neighbor)
                    }
                }
            }
        } else {
            const partition = new Set([nodeId, ...neighbors])
            partitions.push(partition)
        }
    }
    return partitions
}

const getClosestNodes = (
    referenceId: DhtAddress,
    nodeIds: DhtAddress[],
    count: number,
    allowToContainReferenceId: boolean
): DhtAddress[] => {
    const list = new SortedContactList({
        referenceId,
        allowToContainReferenceId,
        maxSize: count
    })
    list.addContacts(nodeIds.map((n) => ({ getNodeId: () => n })))
    return list.getClosestContacts().map((c) => c.getNodeId())
}

/*
 * There are no network splits, and each node has only neighbors which are globally closest
 * to the node's ID.
 */
export const createTestTopology = (nodeCount: number, minNeighorCount: number): Multimap<DhtAddress, DhtAddress> => {
    const topology: Multimap<DhtAddress, DhtAddress> = new Multimap()
    const nodeIds = range(nodeCount).map(() => randomDhtAddress())
    for (const nodeId of nodeIds) {
        const closestNodes = getClosestNodes(nodeId, nodeIds, minNeighorCount, false)
        for (const closestNode of closestNodes) {
            if (!topology.has(nodeId, closestNode)) {
                topology.add(nodeId, closestNode)
            }
            if (!topology.has(closestNode, nodeId)) {
                topology.add(closestNode, nodeId)
            }
        }
    }
    while (true) {
        const partitions = getTopologyPartitions(topology)
        if (partitions.length === 1) {
            break
        } else {
            const closestPairs = nodeIds.map((nodeId: DhtAddress) => {
                const ownPartition = partitions.find((partition) => partition.has(nodeId))!
                const otherNodes = without(nodeIds, ...[...ownPartition])
                const closestNodedId = getClosestNodes(nodeId, otherNodes, 1, false)[0]
                return [nodeId, closestNodedId]
            })
            const mergePair = minBy(closestPairs, (pair) =>
                getDistance(toDhtAddressRaw(pair[0]), toDhtAddressRaw(pair[1]))
            )!
            topology.add(mergePair[0], mergePair[1])
            topology.add(mergePair[1], mergePair[0])
        }
    }
    return topology
}

import { getNodeConnections } from '../../src/logic/trackerSummaryUtils'
import { OverlayTopology } from "../../src/logic/OverlayTopology"

const createOverlayTopology = (mapping: { [key: string]: string[] }) => {
    const overlayTopology = new OverlayTopology(4)
    Object.entries(mapping).forEach(([nodeId, neighbors]) => {
        // Inform tracker of existence of neighbor
        neighbors.forEach((neighbor) => {
            overlayTopology.update(neighbor, [])
        })
        overlayTopology.update(nodeId, neighbors)
    })
    return overlayTopology
}

test('getNodeConnections', () => {
    const nodes = ['node1', 'node2', 'node3', 'node4', 'node5', 'node6', 'nodeNotInTopology']
    const overlayPerStream = {
        'stream-a::0': createOverlayTopology({
            node1: ['node2', 'node3']
        }),
        'stream-b::0': createOverlayTopology({
            node2: ['node4']
        }),
        'stream-c::0': createOverlayTopology({}),
        'stream-d::0': createOverlayTopology({
            node1: ['node3', 'node5']
        }),
        'stream-e::0': createOverlayTopology({
            node6: []
        })
    }
    const result = getNodeConnections(nodes, overlayPerStream)
    expect(Object.keys(result)).toEqual(nodes)
    expect(result.node1).toEqual(new Set(['node2', 'node3', 'node5']))
    expect(result.node2).toEqual(new Set(['node1', 'node4']))
    expect(result.node3).toEqual(new Set(['node1']))
    expect(result.node4).toEqual(new Set(['node2']))
    expect(result.node5).toEqual(new Set(['node1']))
    expect(result.node6).toEqual(new Set([]))
    expect(result.nodeNotInTopology).toEqual(new Set([]))
})

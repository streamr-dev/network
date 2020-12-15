const _ = require('lodash')

const { getTopologyUnion } = require('../../src/logic/TopologyFactory')

const createMockOverlayTopology = (mapping) => {
    return {
        getNodes: () => _.mapValues(mapping, (value) => new Set(value))
    }
}

describe('TopologyFactory', () => {
    it('happy path', () => {
        const overlayPerStream = {
            'stream-a::0': createMockOverlayTopology({
                node1: ['node2', 'node3']
            }),
            'stream-b::0': createMockOverlayTopology({
                node2: ['node4']
            }),
            'stream-c::0': createMockOverlayTopology({}),
            'stream-d::0': createMockOverlayTopology({
                node1: ['node3', 'node5']
            }),
            'stream-e::0': createMockOverlayTopology({
                node6: []
            })
        }
        const union = getTopologyUnion(overlayPerStream)
        expect(Object.keys(union)).toEqual(['node1', 'node2', 'node6'])
        expect(union.node1).toEqual(new Set(['node2', 'node3', 'node5']))
        expect(union.node2).toEqual(new Set(['node4']))
        expect(union.node6).toEqual(new Set([]))
    })
})

import { DhtNode, Simulator, MockConnectionManager, PeerDescriptor } from '@streamr/dht'
import { RandomGraphNode } from '../../src/logic/RandomGraphNode'

describe('RandomGraphNode-DhtNode', () => {
    let dhtNode: DhtNode
    let dhtEntryPoint: DhtNode
    let graphNode: RandomGraphNode

    const streamId = 'Stream1'
    const entrypointDescriptor: PeerDescriptor = {
        peerId: new Uint8Array([1,1,1]),
        type: 0
    }

    const peerDescriptor: PeerDescriptor = {
        peerId: new Uint8Array([1,2,3]),
        type: 0
    }
    beforeEach(async () => {
        const simulator = new Simulator()
        const cm1 = new MockConnectionManager(entrypointDescriptor, simulator)
        const cm2 = new MockConnectionManager(peerDescriptor, simulator)

        dhtEntryPoint = new DhtNode({
            transportLayer: cm1,
            peerDescriptor: entrypointDescriptor,
            appId: streamId
        })
        dhtNode = new DhtNode({
            transportLayer: cm2,
            peerDescriptor: peerDescriptor,
            appId: streamId
        })

        graphNode = new RandomGraphNode({
            randomGraphId: streamId,
            layer1: dhtNode
        })
        await dhtEntryPoint.start()
        await dhtEntryPoint.joinDht(entrypointDescriptor)
        await dhtNode.start()
        await dhtNode.joinDht(entrypointDescriptor)
        graphNode.start()
    })

    afterEach(() => {
        dhtEntryPoint.stop()
        dhtNode.stop()
        graphNode.stop()
    })

    it('todo', () => {
        expect(graphNode.getContactPoolIds().length).toEqual(1)
        expect(graphNode.getSelectedNeighborIds().length).toEqual(1)
    })
})
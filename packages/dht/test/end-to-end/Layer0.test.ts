import { DhtNode } from '../../src/dht/DhtNode'

const WEBSOCKET_PORT_RANGE = { min: 10012, max: 10015 }

describe('Layer0', () => {
    let epDhtNode: DhtNode
    let node1: DhtNode
    let node2: DhtNode
    let node3: DhtNode
    let node4: DhtNode

    beforeEach(async () => {
        epDhtNode = new DhtNode({
            websocketHost: '127.0.0.1',
            websocketPortRange: { min: 10011, max: 10011 },
            websocketServerEnableTls: false
        })
        await epDhtNode.start()
        await epDhtNode.joinDht([epDhtNode.getLocalPeerDescriptor()])

        node1 = new DhtNode({
            websocketPortRange: WEBSOCKET_PORT_RANGE,
            websocketHost: '127.0.0.1',
            entryPoints: [epDhtNode.getLocalPeerDescriptor()],
            websocketServerEnableTls: false
        })
        node2 = new DhtNode({
            websocketPortRange: WEBSOCKET_PORT_RANGE,
            websocketHost: '127.0.0.1',
            entryPoints: [epDhtNode.getLocalPeerDescriptor()],
            websocketServerEnableTls: false
        })
        node3 = new DhtNode({
            websocketPortRange: WEBSOCKET_PORT_RANGE,
            websocketHost: '127.0.0.1',
            entryPoints: [epDhtNode.getLocalPeerDescriptor()],
            websocketServerEnableTls: false
        })
        node4 = new DhtNode({
            websocketPortRange: WEBSOCKET_PORT_RANGE,
            websocketHost: '127.0.0.1',
            entryPoints: [epDhtNode.getLocalPeerDescriptor()],
            websocketServerEnableTls: false
        })

        await Promise.all([node1.start(), node2.start(), node3.start(), node4.start()])
    }, 10000)

    afterEach(async () => {
        await Promise.all([epDhtNode.stop(), node1.stop(), node2.stop(), node3.stop(), node4.stop()])
    })

    it('Happy path', async () => {
        await Promise.all([
            node1.joinDht([epDhtNode.getLocalPeerDescriptor()]),
            node2.joinDht([epDhtNode.getLocalPeerDescriptor()]),
            node3.joinDht([epDhtNode.getLocalPeerDescriptor()]),
            node4.joinDht([epDhtNode.getLocalPeerDescriptor()])
        ])

        expect(node1.getNeighborCount()).toBeGreaterThanOrEqual(2)
        expect(node2.getNeighborCount()).toBeGreaterThanOrEqual(2)
        expect(node3.getNeighborCount()).toBeGreaterThanOrEqual(2)
        expect(node4.getNeighborCount()).toBeGreaterThanOrEqual(2)
    }, 10000)
})

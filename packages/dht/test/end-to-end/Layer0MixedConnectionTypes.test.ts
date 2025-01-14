import { DhtNode } from '../../src/dht/DhtNode'
import { waitForEvent3 } from '@streamr/utils'
import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { TransportEvents } from '../../src/transport/ITransport'
import { createMockPeerDescriptor } from '../utils/utils'

const WEBSOCKET_PORT_RANGE = { min: 11222, max: 11223 }

describe('Layer0MixedConnectionTypes', () => {
    const epPeerDescriptor = createMockPeerDescriptor({
        websocket: { host: '127.0.0.1', port: 11221, tls: false }
    })
    let epDhtNode: DhtNode
    let node1: DhtNode
    let node2: DhtNode
    let node3: DhtNode
    let node4: DhtNode
    let node5: DhtNode

    beforeEach(async () => {
        epDhtNode = new DhtNode({
            peerDescriptor: epPeerDescriptor,
            numberOfNodesPerKBucket: 2,
            websocketServerEnableTls: false
        })
        await epDhtNode.start()

        await epDhtNode.joinDht([epPeerDescriptor])
        node1 = new DhtNode({
            websocketPortRange: WEBSOCKET_PORT_RANGE,
            entryPoints: [epPeerDescriptor],
            websocketServerEnableTls: false
        })
        node2 = new DhtNode({
            websocketPortRange: WEBSOCKET_PORT_RANGE,
            entryPoints: [epPeerDescriptor],
            websocketServerEnableTls: false
        })
        node3 = new DhtNode({
            entryPoints: [epPeerDescriptor]
        })
        node4 = new DhtNode({
            entryPoints: [epPeerDescriptor]
        })
        node5 = new DhtNode({
            entryPoints: [epPeerDescriptor]
        })

        await Promise.all([node1.start(), node2.start(), node3.start(), node4.start(), node5.start()])

        await epDhtNode.joinDht([epPeerDescriptor])
    })

    afterEach(async () => {
        await Promise.all([epDhtNode.stop(), node1.stop(), node2.stop(), node3.stop(), node4.stop(), node5.stop()])
    })

    it('2 non-server peers join first', async () => {
        await Promise.all([
            waitForEvent3<TransportEvents>(node3.getTransport() as ConnectionManager, 'connected'),
            waitForEvent3<TransportEvents>(node4.getTransport() as ConnectionManager, 'connected'),
            node3.joinDht([epPeerDescriptor]),
            node4.joinDht([epPeerDescriptor])
        ])

        await Promise.all([
            node1.joinDht([epPeerDescriptor]),
            node2.joinDht([epPeerDescriptor]),
            node5.joinDht([epPeerDescriptor])
        ])

        expect(node1.getNeighborCount()).toBeGreaterThanOrEqual(2)
        expect(node2.getNeighborCount()).toBeGreaterThanOrEqual(2)
        expect(node3.getNeighborCount()).toBeGreaterThanOrEqual(2)
        expect(node4.getNeighborCount()).toBeGreaterThanOrEqual(2)
        expect(node5.getNeighborCount()).toBeGreaterThanOrEqual(1)
    }, 20000)

    it('Simultaneous joins', async () => {
        await Promise.all([
            node1.joinDht([epPeerDescriptor]),
            node2.joinDht([epPeerDescriptor]),
            node3.joinDht([epPeerDescriptor]),
            node4.joinDht([epPeerDescriptor]),
            node5.joinDht([epPeerDescriptor])
        ])
        expect(node1.getNeighborCount()).toBeGreaterThanOrEqual(2)
        expect(node2.getNeighborCount()).toBeGreaterThanOrEqual(2)
        expect(node3.getNeighborCount()).toBeGreaterThanOrEqual(2)
        expect(node4.getNeighborCount()).toBeGreaterThanOrEqual(2)
        expect(node5.getNeighborCount()).toBeGreaterThanOrEqual(2)
    }, 40000)
})

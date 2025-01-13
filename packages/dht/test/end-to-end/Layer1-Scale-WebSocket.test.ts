import { DhtNode } from '../../src/dht/DhtNode'
import { createMockPeerDescriptor } from '../utils/utils'

const STREAM_ID = 'stream'
const NUM_OF_NODES = 16
const NUM_OF_NODES_PER_KBUCKET = 8
const WEBSOCKET_PORT_RANGE = { min: 62200, max: 62200 + NUM_OF_NODES }

describe('Layer1 Scale', () => {
    const epPeerDescriptor = createMockPeerDescriptor({
        websocket: { host: '127.0.0.1', port: 43225, tls: false }
    })
    let layer0Nodes: DhtNode[]
    let layer1Nodes: DhtNode[]
    let epLayer0Node: DhtNode
    let epLayer1Node: DhtNode

    beforeEach(async () => {
        epLayer0Node = new DhtNode({
            peerDescriptor: epPeerDescriptor,
            websocketServerEnableTls: false
        })
        await epLayer0Node.start()
        await epLayer0Node.joinDht([epPeerDescriptor])

        epLayer1Node = new DhtNode({
            transport: epLayer0Node,
            connectionsView: epLayer0Node.getConnectionsView(),
            peerDescriptor: epPeerDescriptor,
            serviceId: STREAM_ID
        })
        await epLayer1Node.start()
        await epLayer1Node.joinDht([epPeerDescriptor])

        layer0Nodes = []
        layer1Nodes = []

        for (let i = 0; i < NUM_OF_NODES; i++) {
            const node = new DhtNode({
                websocketPortRange: WEBSOCKET_PORT_RANGE,
                entryPoints: [epPeerDescriptor],
                websocketServerEnableTls: false,
                numberOfNodesPerKBucket: NUM_OF_NODES_PER_KBUCKET
            })
            await node.start()
            layer0Nodes.push(node)
            const layer1 = new DhtNode({
                transport: node,
                connectionsView: node.getConnectionsView(),
                entryPoints: [epPeerDescriptor],
                peerDescriptor: node.getLocalPeerDescriptor(),
                serviceId: STREAM_ID,
                numberOfNodesPerKBucket: NUM_OF_NODES_PER_KBUCKET
            })
            await layer1.start()
            layer1Nodes.push(layer1)
        }

        await Promise.all(layer0Nodes.map((node) => node.joinDht([epPeerDescriptor])))

        await Promise.all(layer1Nodes.map((node) => node.joinDht([epPeerDescriptor])))
    }, 120000)

    afterEach(async () => {
        await Promise.all(layer1Nodes.map((node) => node.stop()))
        await Promise.all(layer0Nodes.map((node) => node.stop()))
        await epLayer0Node.stop()
        await epLayer1Node.stop()
    }, 15000)

    // TODO: fix flaky test in NET-1021
    it('bucket sizes', async () => {
        layer0Nodes.forEach((node) => {
            expect(node.getNeighborCount()).toBeGreaterThanOrEqual(NUM_OF_NODES_PER_KBUCKET - 1)
        })
        layer1Nodes.forEach((node) => {
            expect(node.getNeighborCount()).toBeGreaterThanOrEqual(NUM_OF_NODES_PER_KBUCKET / 2)
        })
    })
})

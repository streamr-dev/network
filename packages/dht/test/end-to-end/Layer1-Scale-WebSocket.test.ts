import { DhtNode } from '../../src/dht/DhtNode'
import { NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { PeerID } from '../../src/helpers/PeerID'

describe('Layer1 Scale', () => {
    const epPeerDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString('entrypoint').value,
        type: NodeType.NODEJS,
        websocket: { host: '127.0.0.1', port: 43225, tls: false }
    }

    const STREAM_ID = 'stream'

    const NUM_OF_NODES = 16

    let layer0Nodes: DhtNode[]

    let layer1Nodes: DhtNode[]

    let epLayer0Node: DhtNode
    let epLayer1Node: DhtNode

    const websocketPortRange = { min: 62200, max: 62200 + NUM_OF_NODES }

    beforeEach(async () => {
        epLayer0Node = new DhtNode({ peerDescriptor: epPeerDescriptor })
        await epLayer0Node.start()
        await epLayer0Node.joinDht([epPeerDescriptor])

        epLayer1Node = new DhtNode({ transport: epLayer0Node, peerDescriptor: epPeerDescriptor, serviceId: STREAM_ID })
        await epLayer1Node.start()
        await epLayer1Node.joinDht([epPeerDescriptor])

        layer0Nodes = []
        layer1Nodes = []

        for (let i = 0; i < NUM_OF_NODES; i++) {
            const node = new DhtNode({ websocketPortRange, entryPoints: [epPeerDescriptor] })
            await node.start()
            layer0Nodes.push(node)
            const layer1 = new DhtNode({
                transport: node,
                entryPoints: [epPeerDescriptor],
                peerDescriptor: node.getPeerDescriptor(),
                serviceId: STREAM_ID
            })
            await layer1.start()
            layer1Nodes.push(layer1)
        }

        await Promise.all(layer0Nodes.map((node) => node.joinDht([epPeerDescriptor])))

        await Promise.all(layer1Nodes.map((node) => node.joinDht([epPeerDescriptor])))

    }, 60000)

    afterEach(async () => {
        await Promise.all(layer1Nodes.map((node) => node.stop()))
        await Promise.all(layer0Nodes.map((node) => node.stop()))
        await epLayer0Node.stop()
        await epLayer1Node.stop()
    }, 15000)

    // TODO: fix flaky test in NET-1021
    it('bucket sizes', async () => {
        layer0Nodes.forEach((node) => {
            expect(node.getBucketSize()).toBeGreaterThanOrEqual(node.getK() - 1)
        })
        layer1Nodes.forEach((node ) => {
            expect(node.getBucketSize()).toBeGreaterThanOrEqual(node.getK() / 2)
        })
    })
})

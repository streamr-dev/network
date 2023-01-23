import { DhtNode } from '../../src/dht/DhtNode'
import { NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { PeerID } from '../../src/helpers/PeerID'

describe('Layer1 Scale', () => {
    const epPeerDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString('entrypoint').value,
        type: NodeType.NODEJS,
        websocket: { ip: '127.0.0.1', port: 43225 },
        nodeName: 'entrypoint'
    }

    const STREAM_ID = 'stream'

    const NUM_OF_NODES = 16

    let layer0Nodes: DhtNode[]

    let layer1Nodes: DhtNode[]

    let epLayer0Node: DhtNode
    let epLayer1Node: DhtNode

    beforeEach(async () => {
        epLayer0Node = new DhtNode({ peerDescriptor: epPeerDescriptor, nodeName: 'entrypoint' })
        await epLayer0Node.start()
        await epLayer0Node.joinDht(epPeerDescriptor)

        epLayer1Node = new DhtNode({ transportLayer: epLayer0Node, peerDescriptor: epPeerDescriptor, serviceId: STREAM_ID, nodeName: 'entrypoint' })
        await epLayer1Node.start()
        await epLayer1Node.joinDht(epPeerDescriptor)

        layer0Nodes = []
        layer1Nodes = []

        for (let i = 0; i < NUM_OF_NODES; i++) {
            const node = new DhtNode({ peerIdString: `node-${i}`, nodeName: `${i}`, webSocketPort: 62200 + i, entryPoints: [epPeerDescriptor] })
            await node.start()
            layer0Nodes.push(node)
            const layer1 = new DhtNode({
                nodeName: `${i}`,
                transportLayer: node,
                entryPoints: [epPeerDescriptor],
                peerDescriptor: node.getPeerDescriptor(),
                serviceId: STREAM_ID
            })
            await layer1.start()
            layer1Nodes.push(layer1)
        }

        await Promise.all(layer0Nodes.map((node) => node.joinDht(epPeerDescriptor)))

        await Promise.all(layer1Nodes.map((node) => node.joinDht(epPeerDescriptor)))

    }, 60000)

    afterEach(async () => {
        await Promise.all(layer1Nodes.map((node) => node.stop()))
        await Promise.all(layer0Nodes.map((node) => node.stop()))
        await epLayer0Node.stop()
        await epLayer1Node.stop()
    }, 15000)

    it('bucket sizes', async () => {
        layer0Nodes.forEach((node) => {
            expect(node.getBucketSize()).toBeGreaterThanOrEqual(8)
        })
        layer1Nodes.forEach((node   ) => {
            expect(node.getBucketSize()).toBeGreaterThanOrEqual(8)
        })
    })
})

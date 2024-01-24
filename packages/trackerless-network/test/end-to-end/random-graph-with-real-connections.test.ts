import { ConnectionManager, DhtNode, PeerDescriptor, NodeType } from '@streamr/dht'
import { RandomGraphNode } from '../../src/logic/RandomGraphNode'
import { waitForCondition } from '@streamr/utils'
import { createStreamMessage } from '../utils/utils'
import { createRandomGraphNode } from '../../src/logic/createRandomGraphNode'
import { StreamPartIDUtils } from '@streamr/protocol'
import { randomEthereumAddress } from '@streamr/test-utils'
import { Layer0Node } from '../../src/logic/Layer0Node'
import { Layer1Node } from '../../src/logic/Layer1Node'

describe('random graph with real connections', () => {

    const epPeerDescriptor: PeerDescriptor = {
        nodeId: Uint8Array.from([1, 2, 3]),
        type: NodeType.NODEJS,
        websocket: { host: '127.0.0.1', port: 12221, tls: false }
    }

    const streamPartId = StreamPartIDUtils.parse('random-graph#0')
    // Currently the nodes here are practically layer0 nodes acting as layer1 nodes, for the purpose of this test
    // they are layer1 nodes as the DHT is per stream
    // TODO refactor the test to use normal layering style (i.e. have separate objects for layer0 and layer1 nodes)
    let epDhtNode: Layer0Node & Layer1Node
    let dhtNode1: Layer0Node & Layer1Node
    let dhtNode2: Layer0Node & Layer1Node
    let dhtNode3: Layer0Node & Layer1Node
    let dhtNode4: Layer0Node & Layer1Node
    let randomGraphNode1: RandomGraphNode
    let randomGraphNode2: RandomGraphNode
    let randomGraphNode3: RandomGraphNode
    let randomGraphNode4: RandomGraphNode
    let randomGraphNode5: RandomGraphNode
    const websocketPortRange = { min: 12222, max: 12225 } 

    beforeEach(async () => {
        epDhtNode = new DhtNode({ peerDescriptor: epPeerDescriptor, websocketServerEnableTls: false })
        await epDhtNode.start()
        dhtNode1 = new DhtNode({ websocketPortRange, entryPoints: [epPeerDescriptor], websocketServerEnableTls: false })
        dhtNode2 = new DhtNode({ websocketPortRange, entryPoints: [epPeerDescriptor], websocketServerEnableTls: false })
        dhtNode3 = new DhtNode({ websocketPortRange, entryPoints: [epPeerDescriptor], websocketServerEnableTls: false })
        dhtNode4 = new DhtNode({ websocketPortRange, entryPoints: [epPeerDescriptor], websocketServerEnableTls: false })
        await dhtNode1.start()
        await dhtNode2.start()
        await dhtNode3.start()
        await dhtNode4.start()

        randomGraphNode1 = createRandomGraphNode(
            {
                streamPartId,
                layer1Node: epDhtNode,
                transport: epDhtNode.getTransport(),
                connectionLocker: epDhtNode.getTransport() as ConnectionManager,
                localPeerDescriptor: epPeerDescriptor,
                isLocalNodeEntryPoint: () => false
            }
        )
        randomGraphNode2 = createRandomGraphNode({
            streamPartId,
            layer1Node: dhtNode1,
            transport: dhtNode1.getTransport(),
            connectionLocker: dhtNode1.getTransport() as ConnectionManager,
            localPeerDescriptor: dhtNode1.getLocalPeerDescriptor(),
            isLocalNodeEntryPoint: () => false
        })
        randomGraphNode3 = createRandomGraphNode({
            streamPartId,
            layer1Node: dhtNode2,
            transport: dhtNode2.getTransport(),
            connectionLocker: dhtNode2.getTransport() as ConnectionManager,
            localPeerDescriptor: dhtNode2.getLocalPeerDescriptor(),
            isLocalNodeEntryPoint: () => false
        })
        randomGraphNode4 = createRandomGraphNode({
            streamPartId,
            layer1Node: dhtNode3,
            transport: dhtNode3.getTransport(),
            connectionLocker: dhtNode3.getTransport() as ConnectionManager,
            localPeerDescriptor: dhtNode3.getLocalPeerDescriptor(),
            isLocalNodeEntryPoint: () => false
        })
        randomGraphNode5 = createRandomGraphNode({
            streamPartId,
            layer1Node: dhtNode4,
            transport: dhtNode4.getTransport(),
            connectionLocker: dhtNode4.getTransport() as ConnectionManager,
            localPeerDescriptor: dhtNode4.getLocalPeerDescriptor(),
            isLocalNodeEntryPoint: () => false
        })
        await epDhtNode.joinDht([epPeerDescriptor])
        await Promise.all([
            dhtNode1.joinDht([epPeerDescriptor]),
            dhtNode2.joinDht([epPeerDescriptor]),
            dhtNode3.joinDht([epPeerDescriptor]),
            dhtNode4.joinDht([epPeerDescriptor])
        ])
        await Promise.all([
            randomGraphNode1.start(),
            randomGraphNode2.start(),
            randomGraphNode3.start(),
            randomGraphNode4.start(),
            randomGraphNode5.start()
        ])
    })

    afterEach(async () => {
        await Promise.all([
            epDhtNode.stop(),
            dhtNode1.stop(),
            dhtNode2.stop(),
            dhtNode3.stop(),
            dhtNode4.stop(),
            randomGraphNode1.stop(),
            randomGraphNode2.stop(),
            randomGraphNode3.stop(),
            randomGraphNode4.stop(),
            randomGraphNode5.stop(),
            (epDhtNode.getTransport() as ConnectionManager).stop(),
            (dhtNode1.getTransport() as ConnectionManager).stop(),
            (dhtNode2.getTransport() as ConnectionManager).stop(),
            (dhtNode3.getTransport() as ConnectionManager).stop(),
            (dhtNode4.getTransport() as ConnectionManager).stop()
        ])
    })

    it('can fully connected topologies ', async () => {
        await waitForCondition(() => {
            return randomGraphNode1.getNeighbors().length >= 3
                && randomGraphNode2.getNeighbors().length >= 3
                && randomGraphNode3.getNeighbors().length >= 3
                && randomGraphNode4.getNeighbors().length >= 3
                && randomGraphNode5.getNeighbors().length >= 3
        }, 10000)
        expect(randomGraphNode1.getNeighbors().length).toBeGreaterThanOrEqual(3)
        expect(randomGraphNode2.getNeighbors().length).toBeGreaterThanOrEqual(3)
        expect(randomGraphNode3.getNeighbors().length).toBeGreaterThanOrEqual(3)
        expect(randomGraphNode4.getNeighbors().length).toBeGreaterThanOrEqual(3)
        expect(randomGraphNode5.getNeighbors().length).toBeGreaterThanOrEqual(3)
    })

    it('can propagate messages', async () => {
        let receivedMessageCount = 0
        randomGraphNode2.on('message', () => receivedMessageCount += 1)
        randomGraphNode3.on('message', () => receivedMessageCount += 1)
        randomGraphNode4.on('message', () => receivedMessageCount += 1)
        randomGraphNode5.on('message', () => receivedMessageCount += 1)

        await waitForCondition(() => {
            return randomGraphNode1.getNeighbors().length >= 3
                && randomGraphNode2.getNeighbors().length >= 3
                && randomGraphNode3.getNeighbors().length >= 3
                && randomGraphNode4.getNeighbors().length >= 3
                && randomGraphNode5.getNeighbors().length >= 3
        }, 10000)

        const msg = createStreamMessage(
            JSON.stringify({ hello: 'WORLD' }),
            streamPartId,
            randomEthereumAddress()
        )
        randomGraphNode1.broadcast(msg)
        await waitForCondition(() => receivedMessageCount >= 4)
    })
})

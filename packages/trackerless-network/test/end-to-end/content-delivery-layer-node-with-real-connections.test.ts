import { ConnectionManager, DhtNode, PeerDescriptor } from '@streamr/dht'
import { ContentDeliveryLayerNode } from '../../src/logic/ContentDeliveryLayerNode'
import { waitForCondition } from '@streamr/utils'
import { createMockPeerDescriptor, createStreamMessage } from '../utils/utils'
import { createContentDeliveryLayerNode } from '../../src/logic/createContentDeliveryLayerNode'
import { StreamPartIDUtils } from '@streamr/protocol'
import { randomEthereumAddress } from '@streamr/test-utils'
import { Layer0Node } from '../../src/logic/Layer0Node'
import { Layer1Node } from '../../src/logic/Layer1Node'

describe('content delivery layer node with real connections', () => {

    const epPeerDescriptor: PeerDescriptor = createMockPeerDescriptor({
        websocket: { host: '127.0.0.1', port: 12221, tls: false }
    })

    const streamPartId = StreamPartIDUtils.parse('random-graph#0')
    // Currently the nodes here are practically layer0 nodes acting as layer1 nodes, for the purpose of this test
    // they are layer1 nodes as the DHT is per stream
    // TODO refactor the test to use normal layering style (i.e. have separate objects for layer0 and layer1 nodes)
    let epDhtNode: Layer0Node & Layer1Node
    let dhtNode1: Layer0Node & Layer1Node
    let dhtNode2: Layer0Node & Layer1Node
    let dhtNode3: Layer0Node & Layer1Node
    let dhtNode4: Layer0Node & Layer1Node
    let contentDeliveryLayerNode1: ContentDeliveryLayerNode
    let contentDeliveryLayerNode2: ContentDeliveryLayerNode
    let contentDeliveryLayerNode3: ContentDeliveryLayerNode
    let contentDeliveryLayerNode4: ContentDeliveryLayerNode
    let contentDeliveryLayerNode5: ContentDeliveryLayerNode
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

        contentDeliveryLayerNode1 = createContentDeliveryLayerNode(
            {
                streamPartId,
                layer1Node: epDhtNode,
                transport: epDhtNode.getTransport(),
                connectionLocker: epDhtNode.getTransport() as ConnectionManager,
                localPeerDescriptor: epPeerDescriptor,
                isLocalNodeEntryPoint: () => false
            }
        )
        contentDeliveryLayerNode2 = createContentDeliveryLayerNode({
            streamPartId,
            layer1Node: dhtNode1,
            transport: dhtNode1.getTransport(),
            connectionLocker: dhtNode1.getTransport() as ConnectionManager,
            localPeerDescriptor: dhtNode1.getLocalPeerDescriptor(),
            isLocalNodeEntryPoint: () => false
        })
        contentDeliveryLayerNode3 = createContentDeliveryLayerNode({
            streamPartId,
            layer1Node: dhtNode2,
            transport: dhtNode2.getTransport(),
            connectionLocker: dhtNode2.getTransport() as ConnectionManager,
            localPeerDescriptor: dhtNode2.getLocalPeerDescriptor(),
            isLocalNodeEntryPoint: () => false
        })
        contentDeliveryLayerNode4 = createContentDeliveryLayerNode({
            streamPartId,
            layer1Node: dhtNode3,
            transport: dhtNode3.getTransport(),
            connectionLocker: dhtNode3.getTransport() as ConnectionManager,
            localPeerDescriptor: dhtNode3.getLocalPeerDescriptor(),
            isLocalNodeEntryPoint: () => false
        })
        contentDeliveryLayerNode5 = createContentDeliveryLayerNode({
            streamPartId,
            layer1Node: dhtNode4,
            transport: dhtNode4.getTransport(),
            connectionLocker: dhtNode4.getTransport() as ConnectionManager,
            localPeerDescriptor: dhtNode4.getLocalPeerDescriptor(),
            isLocalNodeEntryPoint: () => false
        })
        await Promise.all([
            contentDeliveryLayerNode1.start(),
            contentDeliveryLayerNode2.start(),
            contentDeliveryLayerNode3.start(),
            contentDeliveryLayerNode4.start(),
            contentDeliveryLayerNode5.start()
        ])
        await epDhtNode.joinDht([epPeerDescriptor])
        await Promise.all([
            dhtNode1.joinDht([epPeerDescriptor]),
            dhtNode2.joinDht([epPeerDescriptor]),
            dhtNode3.joinDht([epPeerDescriptor]),
            dhtNode4.joinDht([epPeerDescriptor])
        ])
    })

    afterEach(async () => {
        await Promise.all([
            epDhtNode.stop(),
            dhtNode1.stop(),
            dhtNode2.stop(),
            dhtNode3.stop(),
            dhtNode4.stop(),
            contentDeliveryLayerNode1.stop(),
            contentDeliveryLayerNode2.stop(),
            contentDeliveryLayerNode3.stop(),
            contentDeliveryLayerNode4.stop(),
            contentDeliveryLayerNode5.stop(),
            (epDhtNode.getTransport() as ConnectionManager).stop(),
            (dhtNode1.getTransport() as ConnectionManager).stop(),
            (dhtNode2.getTransport() as ConnectionManager).stop(),
            (dhtNode3.getTransport() as ConnectionManager).stop(),
            (dhtNode4.getTransport() as ConnectionManager).stop()
        ])
    })

    it('can fully connected topologies ', async () => {
        await waitForCondition(() => {
            return contentDeliveryLayerNode1.getNeighbors().length >= 3
                && contentDeliveryLayerNode2.getNeighbors().length >= 3
                && contentDeliveryLayerNode3.getNeighbors().length >= 3
                && contentDeliveryLayerNode4.getNeighbors().length >= 3
                && contentDeliveryLayerNode5.getNeighbors().length >= 3
        }, 10000)
        expect(contentDeliveryLayerNode1.getNeighbors().length).toBeGreaterThanOrEqual(3)
        expect(contentDeliveryLayerNode2.getNeighbors().length).toBeGreaterThanOrEqual(3)
        expect(contentDeliveryLayerNode3.getNeighbors().length).toBeGreaterThanOrEqual(3)
        expect(contentDeliveryLayerNode4.getNeighbors().length).toBeGreaterThanOrEqual(3)
        expect(contentDeliveryLayerNode5.getNeighbors().length).toBeGreaterThanOrEqual(3)
    })

    it('can propagate messages', async () => {
        let receivedMessageCount = 0
        contentDeliveryLayerNode2.on('message', () => receivedMessageCount += 1)
        contentDeliveryLayerNode3.on('message', () => receivedMessageCount += 1)
        contentDeliveryLayerNode4.on('message', () => receivedMessageCount += 1)
        contentDeliveryLayerNode5.on('message', () => receivedMessageCount += 1)

        await waitForCondition(() => {
            return contentDeliveryLayerNode1.getNeighbors().length >= 3
                && contentDeliveryLayerNode2.getNeighbors().length >= 3
                && contentDeliveryLayerNode3.getNeighbors().length >= 3
                && contentDeliveryLayerNode4.getNeighbors().length >= 3
                && contentDeliveryLayerNode5.getNeighbors().length >= 3
        }, 10000)

        const msg = createStreamMessage(
            JSON.stringify({ hello: 'WORLD' }),
            streamPartId,
            randomEthereumAddress()
        )
        contentDeliveryLayerNode1.broadcast(msg)
        await waitForCondition(() => receivedMessageCount >= 4)
    })
})

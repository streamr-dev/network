import { ConnectionManager, DhtNode, PeerDescriptor, NodeType } from '@streamr/dht'
import { RandomGraphNode } from '../../src/logic/RandomGraphNode'
import { waitForCondition } from '@streamr/utils'
import { createStreamMessage } from '../utils/utils'
import { createRandomGraphNode } from '../../src/logic/createRandomGraphNode'
import { StreamPartIDUtils } from '@streamr/protocol'
import { randomEthereumAddress } from '@streamr/test-utils'
import { ILayer0 } from '../../src/logic/ILayer0'
import { ILayer1 } from '../../src/logic/ILayer1'

describe('random graph with real connections', () => {

    const epPeerDescriptor: PeerDescriptor = {
        kademliaId: Uint8Array.from([1, 2, 3]),
        type: NodeType.NODEJS,
        websocket: { host: '127.0.0.1', port: 12221, tls: false }
    }

    const streamPartId = StreamPartIDUtils.parse('random-graph#0')
    // Currently the nodes here are practically layer0 nodes acting as layer1 nodes, for the purpose of this test
    // they are layer1 nodes as the DHT is per stream
    // TODO refactor the test to use normal layering style (i.e. have separate objects for layer0 and layer1 nodes)
    let epDhtNode: ILayer0 & ILayer1
    let dhtNode1: ILayer0 & ILayer1
    let dhtNode2: ILayer0 & ILayer1
    let dhtNode3: ILayer0 & ILayer1
    let dhtNode4: ILayer0 & ILayer1
    let randomGraphNode1: RandomGraphNode
    let randomGraphNode2: RandomGraphNode
    let randomGraphNode3: RandomGraphNode
    let randomGraphNode4: RandomGraphNode
    let randomGraphNode5: RandomGraphNode
    const websocketPortRange = { min: 12222, max: 12225 } 

    beforeEach(async () => {
        epDhtNode = new DhtNode({ peerDescriptor: epPeerDescriptor })
        await epDhtNode.start()
        dhtNode1 = new DhtNode({ websocketPortRange, entryPoints: [epPeerDescriptor] })
        dhtNode2 = new DhtNode({ websocketPortRange, entryPoints: [epPeerDescriptor] })
        dhtNode3 = new DhtNode({ websocketPortRange, entryPoints: [epPeerDescriptor] })
        dhtNode4 = new DhtNode({ websocketPortRange, entryPoints: [epPeerDescriptor] })
        await dhtNode1.start()
        await dhtNode2.start()
        await dhtNode3.start()
        await dhtNode4.start()

        randomGraphNode1 = createRandomGraphNode(
            {
                streamPartId,
                layer1: epDhtNode,
                transport: epDhtNode.getTransport(),
                connectionLocker: epDhtNode.getTransport() as ConnectionManager,
                ownPeerDescriptor: epPeerDescriptor
            }
        )
        randomGraphNode2 = createRandomGraphNode({
            streamPartId,
            layer1: dhtNode1,
            transport: dhtNode1.getTransport(),
            connectionLocker: dhtNode1.getTransport() as ConnectionManager,
            ownPeerDescriptor: dhtNode1.getPeerDescriptor()
        })
        randomGraphNode3 = createRandomGraphNode({
            streamPartId,
            layer1: dhtNode2,
            transport: dhtNode2.getTransport(),
            connectionLocker: dhtNode2.getTransport() as ConnectionManager,
            ownPeerDescriptor: dhtNode2.getPeerDescriptor()
        })
        randomGraphNode4 = createRandomGraphNode({
            streamPartId,
            layer1: dhtNode3,
            transport: dhtNode3.getTransport(),
            connectionLocker: dhtNode3.getTransport() as ConnectionManager,
            ownPeerDescriptor: dhtNode3.getPeerDescriptor()
        })
        randomGraphNode5 = createRandomGraphNode({
            streamPartId,
            layer1: dhtNode4,
            transport: dhtNode4.getTransport(),
            connectionLocker: dhtNode4.getTransport() as ConnectionManager,
            ownPeerDescriptor: dhtNode4.getPeerDescriptor()
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
            return randomGraphNode1.getTargetNeighborIds().length >= 3
                && randomGraphNode2.getTargetNeighborIds().length >= 3
                && randomGraphNode3.getTargetNeighborIds().length >= 3
                && randomGraphNode4.getTargetNeighborIds().length >= 3
                && randomGraphNode5.getTargetNeighborIds().length >= 3
        }, 10000)
        expect(randomGraphNode1.getTargetNeighborIds().length).toBeGreaterThanOrEqual(3)
        expect(randomGraphNode2.getTargetNeighborIds().length).toBeGreaterThanOrEqual(3)
        expect(randomGraphNode3.getTargetNeighborIds().length).toBeGreaterThanOrEqual(3)
        expect(randomGraphNode4.getTargetNeighborIds().length).toBeGreaterThanOrEqual(3)
        expect(randomGraphNode5.getTargetNeighborIds().length).toBeGreaterThanOrEqual(3)
    })

    it('can propagate messages', async () => {
        let numOfMessagesReceived = 0
        randomGraphNode2.on('message', () => numOfMessagesReceived += 1)
        randomGraphNode3.on('message', () => numOfMessagesReceived += 1)
        randomGraphNode4.on('message', () => numOfMessagesReceived += 1)
        randomGraphNode5.on('message', () => numOfMessagesReceived += 1)

        await waitForCondition(() => {
            return randomGraphNode1.getTargetNeighborIds().length >= 3
                && randomGraphNode2.getTargetNeighborIds().length >= 3
                && randomGraphNode3.getTargetNeighborIds().length >= 3
                && randomGraphNode4.getTargetNeighborIds().length >= 3
                && randomGraphNode5.getTargetNeighborIds().length >= 3
        }, 10000)

        const msg = createStreamMessage(
            JSON.stringify({ hello: 'WORLD' }),
            streamPartId,
            randomEthereumAddress()
        )
        randomGraphNode1.broadcast(msg)
        await waitForCondition(() => numOfMessagesReceived >= 4)
    })
})

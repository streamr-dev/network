import { ConnectionManager, DhtNode, PeerDescriptor, NodeType, peerIdFromPeerDescriptor } from '@streamr/dht'
import { RandomGraphNode } from '../../src/logic/RandomGraphNode'
import { waitForCondition } from '@streamr/utils'
import { createStreamMessage } from '../utils/utils'
import { ContentMessage } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { createRandomGraphNode } from '../../src/logic/createRandomGraphNode'

describe('random graph with real connections', () => {

    const epPeerDescriptor: PeerDescriptor = {
        kademliaId: Uint8Array.from([1, 2, 3]),
        type: NodeType.NODEJS,
        websocket: { ip: 'localhost', port: 12221 }
    }

    const randomGraphId = 'random-graph'
    let epDhtNode: DhtNode
    let dhtNode1: DhtNode
    let dhtNode2: DhtNode
    let dhtNode3: DhtNode
    let dhtNode4: DhtNode
    let randomGraphNode1: RandomGraphNode
    let randomGraphNode2: RandomGraphNode
    let randomGraphNode3: RandomGraphNode
    let randomGraphNode4: RandomGraphNode
    let randomGraphNode5: RandomGraphNode

    beforeEach(async () => {
        epDhtNode = new DhtNode({ peerDescriptor: epPeerDescriptor })
        await epDhtNode.start()
        dhtNode1 = new DhtNode({ peerIdString: '1', webSocketPort: 12222, entryPoints: [epPeerDescriptor] })
        dhtNode2 = new DhtNode({ peerIdString: '2', webSocketPort: 12223, entryPoints: [epPeerDescriptor] })
        dhtNode3 = new DhtNode({ peerIdString: '3', webSocketPort: 12224, entryPoints: [epPeerDescriptor] })
        dhtNode4 = new DhtNode({ peerIdString: '4', webSocketPort: 12225, entryPoints: [epPeerDescriptor] })
        await dhtNode1.start()
        await dhtNode2.start()
        await dhtNode3.start()
        await dhtNode4.start()

        randomGraphNode1 = createRandomGraphNode(
            {
                randomGraphId,
                layer1: epDhtNode,
                P2PTransport: epDhtNode.getTransport(),
                connectionLocker: epDhtNode.getTransport() as ConnectionManager,
                ownPeerDescriptor: epPeerDescriptor
            }
        )
        randomGraphNode2 = createRandomGraphNode({
            randomGraphId,
            layer1: dhtNode1,
            P2PTransport: dhtNode1.getTransport(),
            connectionLocker: dhtNode1.getTransport() as ConnectionManager,
            ownPeerDescriptor: dhtNode1.getPeerDescriptor()
        })
        randomGraphNode3 = createRandomGraphNode({
            randomGraphId,
            layer1: dhtNode2,
            P2PTransport: dhtNode2.getTransport(),
            connectionLocker: dhtNode2.getTransport() as ConnectionManager,
            ownPeerDescriptor: dhtNode2.getPeerDescriptor()
        })
        randomGraphNode4 = createRandomGraphNode({
            randomGraphId,
            layer1: dhtNode3,
            P2PTransport: dhtNode3.getTransport(),
            connectionLocker: dhtNode3.getTransport() as ConnectionManager,
            ownPeerDescriptor: dhtNode3.getPeerDescriptor()
        })
        randomGraphNode5 = createRandomGraphNode({
            randomGraphId,
            layer1: dhtNode4,
            P2PTransport: dhtNode4.getTransport(),
            connectionLocker: dhtNode4.getTransport() as ConnectionManager,
            ownPeerDescriptor: dhtNode4.getPeerDescriptor()
        })
        await epDhtNode.joinDht(epPeerDescriptor)
        await Promise.all([
            dhtNode1.joinDht(epPeerDescriptor),
            dhtNode2.joinDht(epPeerDescriptor),
            dhtNode3.joinDht(epPeerDescriptor),
            dhtNode4.joinDht(epPeerDescriptor)
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
            return randomGraphNode1.getTargetNeighborStringIds().length >= 3
                && randomGraphNode2.getTargetNeighborStringIds().length >= 3
                && randomGraphNode3.getTargetNeighborStringIds().length >= 3
                && randomGraphNode4.getTargetNeighborStringIds().length >= 3
                && randomGraphNode5.getTargetNeighborStringIds().length >= 3
        }, 10000)
        expect(randomGraphNode1.getTargetNeighborStringIds().length).toBeGreaterThanOrEqual(3)
        expect(randomGraphNode2.getTargetNeighborStringIds().length).toBeGreaterThanOrEqual(3)
        expect(randomGraphNode3.getTargetNeighborStringIds().length).toBeGreaterThanOrEqual(3)
        expect(randomGraphNode4.getTargetNeighborStringIds().length).toBeGreaterThanOrEqual(3)
        expect(randomGraphNode5.getTargetNeighborStringIds().length).toBeGreaterThanOrEqual(3)
    })

    it('can propagate messages', async () => {
        let numOfMessagesReceived = 0
        randomGraphNode2.on('message', () => numOfMessagesReceived += 1)
        randomGraphNode3.on('message', () => numOfMessagesReceived += 1)
        randomGraphNode4.on('message', () => numOfMessagesReceived += 1)
        randomGraphNode5.on('message', () => numOfMessagesReceived += 1)

        await waitForCondition(() => {
            return randomGraphNode1.getTargetNeighborStringIds().length >= 3
                && randomGraphNode2.getTargetNeighborStringIds().length >= 3
                && randomGraphNode3.getTargetNeighborStringIds().length >= 3
                && randomGraphNode4.getTargetNeighborStringIds().length >= 3
                && randomGraphNode5.getTargetNeighborStringIds().length >= 3
        }, 10000)

        const content: ContentMessage = {
            body: JSON.stringify({ hello: "WORLD" })
        }
        const msg = createStreamMessage(
            content,
            randomGraphId,
            peerIdFromPeerDescriptor(epPeerDescriptor).toString()
        )
        randomGraphNode1.broadcast(msg)
        await waitForCondition(() => numOfMessagesReceived >= 4)
    })
})

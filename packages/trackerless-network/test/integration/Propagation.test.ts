import { DhtNode, PeerDescriptor, Simulator, PeerID, UUID, peerIdFromPeerDescriptor } from '@streamr/dht'
import { RandomGraphNode } from '../../src/logic/RandomGraphNode'
import { createMockRandomGraphNodeAndDhtNode, createStreamMessage } from '../utils'
import { range } from 'lodash'
import { ContentMessage } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { waitForCondition } from '@streamr/utils'

describe('Propagation', () => {
    const entryPointDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString(`entrypoint`).value,
        type: 1
    }
    let dhtNodes: DhtNode[]
    let randomGraphNodes: RandomGraphNode[]
    const STREAM_ID = 'testingtesting'
    let totalReceived: number
    const NUM_OF_NODES = 256

    beforeEach(async () => {
        totalReceived = 0
        const simulator = new Simulator()
        dhtNodes = []
        randomGraphNodes = []
        const [entryPoint, node1] = createMockRandomGraphNodeAndDhtNode(entryPointDescriptor, entryPointDescriptor, STREAM_ID, simulator)
        await entryPoint.start()
        await entryPoint.joinDht(entryPointDescriptor)
        await node1.start()
        node1.on('message', () => {totalReceived += 1})
        dhtNodes.push(entryPoint)
        randomGraphNodes.push(node1)

        await Promise.all(range(NUM_OF_NODES).map(async (_i) => {
            const descriptor: PeerDescriptor = {
                kademliaId: PeerID.fromString(new UUID().toString()).value,
                type: 1
            }
            const [dht, graph] = createMockRandomGraphNodeAndDhtNode(
                descriptor,
                entryPointDescriptor,
                STREAM_ID,
                simulator
            )
            await dht.start()
            await graph.start()
            await dht.joinDht(entryPointDescriptor).then(() => {
                graph.on('message', () => { totalReceived += 1 })
                dhtNodes.push(dht)
                randomGraphNodes.push(graph)
            })
        }))
    }, 45000)

    afterEach(async () => {
        await Promise.all(randomGraphNodes.map((node) => node.stop()))
        await Promise.all(dhtNodes.map((node) => node.stop()))
    })

    it('All nodes receive messages', async () => {
        await waitForCondition(
            () => randomGraphNodes.every((peer) => peer.getTargetNeighborStringIds().length >= 3), 30000
        )
        await waitForCondition(() => {
            const avg = randomGraphNodes.reduce((acc, curr) => {
                return acc + curr.getTargetNeighborStringIds().length
            }, 0) / randomGraphNodes.length
            return avg >= 4
        }, 20000)
        const content: ContentMessage = {
            body: JSON.stringify({ hello: "WORLD" })
        }
        const msg = createStreamMessage(
            content,
            STREAM_ID,
            peerIdFromPeerDescriptor(dhtNodes[0].getPeerDescriptor()).toString()
        )
        randomGraphNodes[0].broadcast(msg)
        await waitForCondition(() => totalReceived >= NUM_OF_NODES, 10000)
    }, 45000)
})

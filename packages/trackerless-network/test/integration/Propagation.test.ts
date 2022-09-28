import { DhtNode, PeerDescriptor, Simulator, PeerID } from '@streamr/dht'
import { Event, RandomGraphNode } from '../../src/logic/RandomGraphNode'
import { createMockRandomGraphNodeAndDhtNode } from '../utils'
import { range } from 'lodash'
import { DataMessage, MessageRef } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { waitForCondition } from 'streamr-test-utils'

describe('Propagation', () => {
    const entryPointDescriptor: PeerDescriptor = {
        peerId: new Uint8Array([1, 2, 3]),
        type: 1
    }

    let dhtNodes: DhtNode[]
    let randomGraphNodes: RandomGraphNode[]
    const STREAM_ID = 'testingtesting'
    let totalReceived: number

    const NUM_OF_NODES = 128

    beforeEach(async () => {
        totalReceived = 0
        const simulator = new Simulator()
        dhtNodes = []
        randomGraphNodes = []
        const [entryPoint, node1] = createMockRandomGraphNodeAndDhtNode(entryPointDescriptor, entryPointDescriptor, STREAM_ID, simulator)

        await entryPoint.start()
        await entryPoint.joinDht(entryPointDescriptor)
        await node1.start()
        node1.on(Event.MESSAGE, () => {totalReceived += 1})
        dhtNodes.push(entryPoint)
        randomGraphNodes.push(node1)

        range(NUM_OF_NODES).map(async (i) => {
            const descriptor: PeerDescriptor = {
                peerId: PeerID.fromString(`peer-${i}`).value,
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
            await dht.joinDht(entryPointDescriptor)
            graph.on(Event.MESSAGE, () => {totalReceived += 1})
            dhtNodes.push(dht)
            randomGraphNodes.push(graph)
        })
    })

    afterEach(async () => {
        await Promise.all(randomGraphNodes.map((node) => node.stop()))
        await Promise.all(dhtNodes.map((node) => node.stop()))
    })

    it('All nodes receive messages', async () => {
        await waitForCondition(
            () => randomGraphNodes.every(
                (peer) => peer.getSelectedNeighborIds().length >= 3
            )
        )
        const messageRef: MessageRef = {
            sequenceNumber: 1,
            timestamp: BigInt(123123)
        }
        const message: DataMessage = {
            content: JSON.stringify({ hello: "WORLD" }),
            senderId: PeerID.fromValue(dhtNodes[0].getPeerDescriptor().peerId).toString(),
            messageRef,
            streamPartId: STREAM_ID
        }
        randomGraphNodes[0].broadcast(message)
        await waitForCondition(() => totalReceived >= NUM_OF_NODES)
    }, 10000)
})

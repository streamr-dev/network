import { DhtNode, PeerDescriptor, Simulator, SimulatorTransport } from '@streamr/dht'
import { StreamrNode, Events } from '../../src/logic/StreamrNode'
import { waitForEvent3, waitForCondition } from '@streamr/utils'
import { createMockPeerDescriptor, createStreamMessage } from '../utils/utils'
import { StreamPartIDUtils } from '@streamr/protocol'
import { randomEthereumAddress } from '@streamr/test-utils'
import { Layer0Node } from '../../src/logic/Layer0Node'

describe('StreamrNode', () => {

    let layer0Node1: Layer0Node
    let layer0Node2: Layer0Node
    let transport1: SimulatorTransport
    let transport2: SimulatorTransport
    let node1: StreamrNode
    let node2: StreamrNode

    const peerDescriptor1: PeerDescriptor = createMockPeerDescriptor()
    const peerDescriptor2: PeerDescriptor = createMockPeerDescriptor()
    const STREAM_PART_ID = StreamPartIDUtils.parse('test#0')

    const msg = createStreamMessage(
        JSON.stringify({ hello: 'WORLD' }),
        STREAM_PART_ID,
        randomEthereumAddress()
    )

    afterEach(async () => {
        await Promise.all([
            node1.destroy(),
            node2.destroy(),
            layer0Node1.stop(),
            layer0Node2.stop()
        ])
    })

    beforeEach(async () => {
        const simulator = new Simulator()
        transport1 = new SimulatorTransport(peerDescriptor1, simulator)
        await transport1.start()
        transport2 = new SimulatorTransport(peerDescriptor2, simulator)
        await transport2.start()
        layer0Node1 = new DhtNode({
            transport: transport1,
            stopGivenTransport: true,
            peerDescriptor: peerDescriptor1,
            entryPoints: [peerDescriptor1]
        })
        layer0Node2 = new DhtNode({
            transport: transport2,
            stopGivenTransport: true,
            peerDescriptor: peerDescriptor2,
            entryPoints: [peerDescriptor1]
        })
        await Promise.all([
            layer0Node1.start(),
            layer0Node2.start()
        ])
        await Promise.all([
            layer0Node1.joinDht([peerDescriptor1]),
            layer0Node2.joinDht([peerDescriptor1])
        ])

        node1 = new StreamrNode({})
        node2 = new StreamrNode({})
        await node1.start(layer0Node1, transport1, transport1)
        node1.setStreamPartEntryPoints(STREAM_PART_ID, [peerDescriptor1])
        await node2.start(layer0Node2, transport2, transport2)
        node2.setStreamPartEntryPoints(STREAM_PART_ID, [peerDescriptor1])
    })

    it('starts', async () => {
        expect(node1.getPeerDescriptor()).toEqual(peerDescriptor1)
        expect(node2.getPeerDescriptor()).toEqual(peerDescriptor2)
    })

    it('Joining stream', async () => {
        node1.joinStreamPart(STREAM_PART_ID)
        node2.joinStreamPart(STREAM_PART_ID)
        await waitForCondition(() => node1.getNeighbors(STREAM_PART_ID).length === 1)
        await waitForCondition(() => node2.getNeighbors(STREAM_PART_ID).length === 1)
        expect(node1.getNeighbors(STREAM_PART_ID).length).toEqual(1)
        expect(node2.getNeighbors(STREAM_PART_ID).length).toEqual(1)
    })

    it('Publishing after joining and waiting for neighbors', async () => {
        node1.joinStreamPart(STREAM_PART_ID)
        node2.joinStreamPart(STREAM_PART_ID)
        await waitForCondition(() => node1.getNeighbors(STREAM_PART_ID).length === 1)
        await waitForCondition(() => node2.getNeighbors(STREAM_PART_ID).length === 1)
        await Promise.all([
            waitForEvent3<Events>(node1, 'newMessage'),
            node2.broadcast(msg)
        ])
    })

    it('multi-stream pub/sub', async () => {
        const streamPartId2 = StreamPartIDUtils.parse('test2#0')
        node1.setStreamPartEntryPoints(streamPartId2, [peerDescriptor1])
        node2.setStreamPartEntryPoints(streamPartId2, [peerDescriptor1])
        node1.joinStreamPart(STREAM_PART_ID)
        node1.joinStreamPart(streamPartId2)
        node2.joinStreamPart(STREAM_PART_ID)
        node2.joinStreamPart(streamPartId2)
        await Promise.all([
            waitForCondition(() => node1.getNeighbors(STREAM_PART_ID).length === 1),
            waitForCondition(() => node2.getNeighbors(STREAM_PART_ID).length === 1),
            waitForCondition(() => node1.getNeighbors(streamPartId2).length === 1),
            waitForCondition(() => node2.getNeighbors(streamPartId2).length === 1)
        ])
        const msg2 = createStreamMessage(
            JSON.stringify({ hello: 'WORLD' }),
            streamPartId2,
            randomEthereumAddress()
        )
        await Promise.all([
            waitForEvent3<Events>(node1, 'newMessage'),
            waitForEvent3<Events>(node2, 'newMessage'),
            node1.broadcast(msg2),
            node2.broadcast(msg)
        ])
    })

    it('leaving stream parts', async () => {
        node1.joinStreamPart(STREAM_PART_ID)
        node2.joinStreamPart(STREAM_PART_ID)
        await Promise.all([
            waitForCondition(() => node1.getNeighbors(STREAM_PART_ID).length === 1),
            waitForCondition(() => node2.getNeighbors(STREAM_PART_ID).length === 1)
        ])
        await node2.leaveStreamPart(STREAM_PART_ID)
        await waitForCondition(() => node1.getNeighbors(STREAM_PART_ID).length === 0)
    })

})

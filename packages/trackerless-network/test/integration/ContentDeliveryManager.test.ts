import {
    DhtNode,
    Simulator,
    SimulatorTransport
} from '@streamr/dht'
import { ContentDeliveryManager, Events } from '../../src/logic/ContentDeliveryManager'
import { waitForEvent3, waitForCondition } from '@streamr/utils'
import { createMockPeerDescriptor, createStreamMessage } from '../utils/utils'
import { StreamPartIDUtils } from '@streamr/protocol'
import { randomEthereumAddress } from '@streamr/test-utils'
import { ControlLayerNode } from '../../src/logic/ControlLayerNode'

describe('ContentDeliveryManager', () => {

    let controlLayerNode1: ControlLayerNode
    let controlLayerNode2: ControlLayerNode
    let transport1: SimulatorTransport
    let transport2: SimulatorTransport
    let manager1: ContentDeliveryManager
    let manager2: ContentDeliveryManager

    const peerDescriptor1 = createMockPeerDescriptor()
    const peerDescriptor2 = createMockPeerDescriptor()
    const STREAM_PART_ID = StreamPartIDUtils.parse('test#0')

    const msg = createStreamMessage(
        JSON.stringify({ hello: 'WORLD' }),
        STREAM_PART_ID,
        randomEthereumAddress()
    )

    afterEach(async () => {
        await Promise.all([
            manager1.destroy(),
            manager2.destroy()
        ])
    })

    beforeEach(async () => {
        const simulator = new Simulator()
        transport1 = new SimulatorTransport(peerDescriptor1, simulator)
        await transport1.start()
        transport2 = new SimulatorTransport(peerDescriptor2, simulator)
        await transport2.start()
        controlLayerNode1 = new DhtNode({
            transport: transport1,
            connectionsView: transport1,
            peerDescriptor: peerDescriptor1,
            entryPoints: [peerDescriptor1]
        })
        controlLayerNode2 = new DhtNode({
            transport: transport2,
            connectionsView: transport2,
            peerDescriptor: peerDescriptor2,
            entryPoints: [peerDescriptor1]
        })
        await Promise.all([
            controlLayerNode1.start(),
            controlLayerNode2.start()
        ])
        await Promise.all([
            controlLayerNode1.joinDht([peerDescriptor1]),
            controlLayerNode2.joinDht([peerDescriptor1])
        ])

        manager1 = new ContentDeliveryManager({})
        manager2 = new ContentDeliveryManager({})
        await manager1.start(controlLayerNode1, transport1, transport1)
        manager1.setStreamPartEntryPoints(STREAM_PART_ID, [peerDescriptor1])
        await manager2.start(controlLayerNode2, transport2, transport2)
        manager2.setStreamPartEntryPoints(STREAM_PART_ID, [peerDescriptor1])
    })

    it('starts', async () => {
        expect(manager1.getPeerDescriptor()).toEqual(peerDescriptor1)
        expect(manager2.getPeerDescriptor()).toEqual(peerDescriptor2)
    })

    it('Joining stream', async () => {
        manager1.joinStreamPart(STREAM_PART_ID)
        manager2.joinStreamPart(STREAM_PART_ID)
        await waitForCondition(() => manager1.getNeighbors(STREAM_PART_ID).length === 1)
        await waitForCondition(() => manager2.getNeighbors(STREAM_PART_ID).length === 1)
        expect(manager1.getNeighbors(STREAM_PART_ID).length).toEqual(1)
        expect(manager2.getNeighbors(STREAM_PART_ID).length).toEqual(1)
    })

    it('Publishing after joining and waiting for neighbors', async () => {
        manager1.joinStreamPart(STREAM_PART_ID)
        manager2.joinStreamPart(STREAM_PART_ID)
        await waitForCondition(() => manager1.getNeighbors(STREAM_PART_ID).length === 1)
        await waitForCondition(() => manager2.getNeighbors(STREAM_PART_ID).length === 1)
        await Promise.all([
            waitForEvent3<Events>(manager1, 'newMessage'),
            manager2.broadcast(msg)
        ])
    })

    it('multi-stream pub/sub', async () => {
        const streamPartId2 = StreamPartIDUtils.parse('test2#0')
        manager1.setStreamPartEntryPoints(streamPartId2, [peerDescriptor1])
        manager2.setStreamPartEntryPoints(streamPartId2, [peerDescriptor1])
        manager1.joinStreamPart(STREAM_PART_ID)
        manager1.joinStreamPart(streamPartId2)
        manager2.joinStreamPart(STREAM_PART_ID)
        manager2.joinStreamPart(streamPartId2)
        await Promise.all([
            waitForCondition(() => manager1.getNeighbors(STREAM_PART_ID).length === 1),
            waitForCondition(() => manager2.getNeighbors(STREAM_PART_ID).length === 1),
            waitForCondition(() => manager1.getNeighbors(streamPartId2).length === 1),
            waitForCondition(() => manager2.getNeighbors(streamPartId2).length === 1)
        ])
        const msg2 = createStreamMessage(
            JSON.stringify({ hello: 'WORLD' }),
            streamPartId2,
            randomEthereumAddress()
        )
        await Promise.all([
            waitForEvent3<Events>(manager1, 'newMessage'),
            waitForEvent3<Events>(manager2, 'newMessage'),
            manager1.broadcast(msg2),
            manager2.broadcast(msg)
        ])
    })

    it('leaving stream parts', async () => {
        manager1.joinStreamPart(STREAM_PART_ID)
        manager2.joinStreamPart(STREAM_PART_ID)
        await Promise.all([
            waitForCondition(() => manager1.getNeighbors(STREAM_PART_ID).length === 1),
            waitForCondition(() => manager2.getNeighbors(STREAM_PART_ID).length === 1)
        ])
        await manager2.leaveStreamPart(STREAM_PART_ID)
        await waitForCondition(() => manager1.getNeighbors(STREAM_PART_ID).length === 0)
    })

})

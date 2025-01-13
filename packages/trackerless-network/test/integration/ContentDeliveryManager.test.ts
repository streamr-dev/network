import { DhtNode, Simulator, SimulatorTransport } from '@streamr/dht'
import { StreamPartIDUtils, until, waitForEvent3, wait } from '@streamr/utils'
import { ContentDeliveryManager, Events } from '../../src/logic/ContentDeliveryManager'
import { ControlLayerNode } from '../../src/logic/ControlLayerNode'
import { createMockPeerDescriptor, createStreamMessage } from '../utils/utils'
import { randomUserId } from '@streamr/test-utils'

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

    const msg = createStreamMessage(JSON.stringify({ hello: 'WORLD' }), STREAM_PART_ID, randomUserId())
    let simulator: Simulator

    beforeEach(async () => {
        simulator = new Simulator()
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
        await Promise.all([controlLayerNode1.start(), controlLayerNode2.start()])
        await Promise.all([controlLayerNode1.joinDht([peerDescriptor1]), controlLayerNode2.joinDht([peerDescriptor1])])

        manager1 = new ContentDeliveryManager({ neighborUpdateInterval: 100 })
        manager2 = new ContentDeliveryManager({ neighborUpdateInterval: 100 })
        await manager1.start(controlLayerNode1, transport1, transport1)
        manager1.setStreamPartEntryPoints(STREAM_PART_ID, [peerDescriptor1])
        await manager2.start(controlLayerNode2, transport2, transport2)
        manager2.setStreamPartEntryPoints(STREAM_PART_ID, [peerDescriptor1])
    })

    afterEach(async () => {
        await Promise.all([
            manager1.destroy(),
            manager2.destroy(),
            controlLayerNode1.stop(),
            controlLayerNode2.stop(),
            transport1.stop(),
            transport2.stop()
        ])
        simulator.stop()
    })

    it('starts', async () => {
        expect(manager1.getPeerDescriptor()).toEqual(peerDescriptor1)
        expect(manager2.getPeerDescriptor()).toEqual(peerDescriptor2)
    })

    it('Joining stream', async () => {
        manager1.joinStreamPart(STREAM_PART_ID)
        manager2.joinStreamPart(STREAM_PART_ID)
        await until(() => manager1.getNeighbors(STREAM_PART_ID).length === 1)
        await until(() => manager2.getNeighbors(STREAM_PART_ID).length === 1)
        expect(manager1.getNeighbors(STREAM_PART_ID).length).toEqual(1)
        expect(manager2.getNeighbors(STREAM_PART_ID).length).toEqual(1)
    })

    it('Publishing after joining and waiting for neighbors', async () => {
        manager1.joinStreamPart(STREAM_PART_ID)
        manager2.joinStreamPart(STREAM_PART_ID)
        await until(() => manager1.getNeighbors(STREAM_PART_ID).length === 1)
        await until(() => manager2.getNeighbors(STREAM_PART_ID).length === 1)
        await Promise.all([
            waitForEvent3<Events>(manager1, 'newMessage'),
            // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
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
            until(() => manager1.getNeighbors(STREAM_PART_ID).length === 1),
            until(() => manager2.getNeighbors(STREAM_PART_ID).length === 1),
            until(() => manager1.getNeighbors(streamPartId2).length === 1),
            until(() => manager2.getNeighbors(streamPartId2).length === 1)
        ])
        const msg2 = createStreamMessage(JSON.stringify({ hello: 'WORLD' }), streamPartId2, randomUserId())
        await Promise.all([
            waitForEvent3<Events>(manager1, 'newMessage'),
            waitForEvent3<Events>(manager2, 'newMessage'),
            // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
            manager1.broadcast(msg2),
            // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
            manager2.broadcast(msg)
        ])
    })

    it('leaving stream parts', async () => {
        manager1.joinStreamPart(STREAM_PART_ID)
        manager2.joinStreamPart(STREAM_PART_ID)
        await Promise.all([
            until(() => manager1.getNeighbors(STREAM_PART_ID).length === 1),
            until(() => manager2.getNeighbors(STREAM_PART_ID).length === 1)
        ])
        await manager2.leaveStreamPart(STREAM_PART_ID)
        await until(() => manager1.getNeighbors(STREAM_PART_ID).length === 0)
    })

    it('RTTs are updated for node info', async () => {
        manager1.joinStreamPart(STREAM_PART_ID)
        manager2.joinStreamPart(STREAM_PART_ID)
        await Promise.all([
            until(() => manager1.getNeighbors(STREAM_PART_ID).length === 1),
            until(() => manager2.getNeighbors(STREAM_PART_ID).length === 1)
        ])
        // Wait for RTTs to be updated
        await wait(500)
        const nodeInfo1 = manager1.getNodeInfo()
        const nodeInfo2 = manager2.getNodeInfo()
        expect(nodeInfo1[0].contentDeliveryLayerNeighbors[0].rtt).toBeGreaterThanOrEqual(0)
        expect(nodeInfo2[0].contentDeliveryLayerNeighbors[0].rtt).toBeGreaterThanOrEqual(0)
    })
})

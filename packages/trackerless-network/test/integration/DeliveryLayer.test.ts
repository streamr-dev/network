import {
    DhtNode,
    Simulator,
    SimulatorTransport
} from '@streamr/dht'
import { DeliveryLayer, Events } from '../../src/logic/DeliveryLayer'
import { waitForEvent3, waitForCondition } from '@streamr/utils'
import { createMockPeerDescriptor, createStreamMessage } from '../utils/utils'
import { StreamPartIDUtils } from '@streamr/protocol'
import { randomEthereumAddress } from '@streamr/test-utils'
import { Layer0Node } from '../../src/logic/Layer0Node'

describe('DeliveryLayer', () => {

    let layer0Node1: Layer0Node
    let layer0Node2: Layer0Node
    let transport1: SimulatorTransport
    let transport2: SimulatorTransport
    let deliveryLayer1: DeliveryLayer
    let deliveryLayer2: DeliveryLayer

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
            deliveryLayer1.destroy(),
            deliveryLayer2.destroy()
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
            peerDescriptor: peerDescriptor1,
            entryPoints: [peerDescriptor1]
        })
        layer0Node2 = new DhtNode({
            transport: transport2,
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

        deliveryLayer1 = new DeliveryLayer({})
        deliveryLayer2 = new DeliveryLayer({})
        await deliveryLayer1.start(layer0Node1, transport1, transport1)
        deliveryLayer1.setStreamPartEntryPoints(STREAM_PART_ID, [peerDescriptor1])
        await deliveryLayer2.start(layer0Node2, transport2, transport2)
        deliveryLayer2.setStreamPartEntryPoints(STREAM_PART_ID, [peerDescriptor1])
    })

    it('starts', async () => {
        expect(deliveryLayer1.getPeerDescriptor()).toEqual(peerDescriptor1)
        expect(deliveryLayer2.getPeerDescriptor()).toEqual(peerDescriptor2)
    })

    it('Joining stream', async () => {
        deliveryLayer1.joinStreamPart(STREAM_PART_ID)
        deliveryLayer2.joinStreamPart(STREAM_PART_ID)
        await waitForCondition(() => deliveryLayer1.getNeighbors(STREAM_PART_ID).length === 1)
        await waitForCondition(() => deliveryLayer2.getNeighbors(STREAM_PART_ID).length === 1)
        expect(deliveryLayer1.getNeighbors(STREAM_PART_ID).length).toEqual(1)
        expect(deliveryLayer2.getNeighbors(STREAM_PART_ID).length).toEqual(1)
    })

    it('Publishing after joining and waiting for neighbors', async () => {
        deliveryLayer1.joinStreamPart(STREAM_PART_ID)
        deliveryLayer2.joinStreamPart(STREAM_PART_ID)
        await waitForCondition(() => deliveryLayer1.getNeighbors(STREAM_PART_ID).length === 1)
        await waitForCondition(() => deliveryLayer2.getNeighbors(STREAM_PART_ID).length === 1)
        await Promise.all([
            waitForEvent3<Events>(deliveryLayer1, 'newMessage'),
            deliveryLayer2.broadcast(msg)
        ])
    })

    it('multi-stream pub/sub', async () => {
        const streamPartId2 = StreamPartIDUtils.parse('test2#0')
        deliveryLayer1.setStreamPartEntryPoints(streamPartId2, [peerDescriptor1])
        deliveryLayer2.setStreamPartEntryPoints(streamPartId2, [peerDescriptor1])
        deliveryLayer1.joinStreamPart(STREAM_PART_ID)
        deliveryLayer1.joinStreamPart(streamPartId2)
        deliveryLayer2.joinStreamPart(STREAM_PART_ID)
        deliveryLayer2.joinStreamPart(streamPartId2)
        await Promise.all([
            waitForCondition(() => deliveryLayer1.getNeighbors(STREAM_PART_ID).length === 1),
            waitForCondition(() => deliveryLayer2.getNeighbors(STREAM_PART_ID).length === 1),
            waitForCondition(() => deliveryLayer1.getNeighbors(streamPartId2).length === 1),
            waitForCondition(() => deliveryLayer2.getNeighbors(streamPartId2).length === 1)
        ])
        const msg2 = createStreamMessage(
            JSON.stringify({ hello: 'WORLD' }),
            streamPartId2,
            randomEthereumAddress()
        )
        await Promise.all([
            waitForEvent3<Events>(deliveryLayer1, 'newMessage'),
            waitForEvent3<Events>(deliveryLayer2, 'newMessage'),
            deliveryLayer1.broadcast(msg2),
            deliveryLayer2.broadcast(msg)
        ])
    })

    it('leaving stream parts', async () => {
        deliveryLayer1.joinStreamPart(STREAM_PART_ID)
        deliveryLayer2.joinStreamPart(STREAM_PART_ID)
        await Promise.all([
            waitForCondition(() => deliveryLayer1.getNeighbors(STREAM_PART_ID).length === 1),
            waitForCondition(() => deliveryLayer2.getNeighbors(STREAM_PART_ID).length === 1)
        ])
        await deliveryLayer2.leaveStreamPart(STREAM_PART_ID)
        await waitForCondition(() => deliveryLayer1.getNeighbors(STREAM_PART_ID).length === 0)
    })

})

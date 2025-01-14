import { DhtNode } from '../../src/dht/DhtNode'
import { areEqualPeerDescriptors } from '../../src/identifiers'
import { createMockPeerDescriptor } from '../utils/utils'

const STREAM_ID1 = 'stream1'
const STREAM_ID2 = 'stream2'
const WEBSOCKET_PORT_RANGE = { min: 10017, max: 10018 }

describe('Layer0-Layer1', () => {
    const epPeerDescriptor = createMockPeerDescriptor({
        websocket: { host: '127.0.0.1', port: 10016, tls: false }
    })
    let epDhtNode: DhtNode
    let node1: DhtNode
    let node2: DhtNode
    let stream1Node1: DhtNode
    let stream1Node2: DhtNode
    let stream2Node1: DhtNode
    let stream2Node2: DhtNode

    beforeEach(async () => {
        epDhtNode = new DhtNode({ peerDescriptor: epPeerDescriptor, websocketServerEnableTls: false })
        await epDhtNode.start()
        await epDhtNode.joinDht([epPeerDescriptor])

        node1 = new DhtNode({
            websocketPortRange: WEBSOCKET_PORT_RANGE,
            entryPoints: [epPeerDescriptor],
            websocketServerEnableTls: false
        })
        node2 = new DhtNode({
            websocketPortRange: WEBSOCKET_PORT_RANGE,
            entryPoints: [epPeerDescriptor],
            websocketServerEnableTls: false
        })

        await node1.start()
        await node2.start()

        stream1Node1 = new DhtNode({
            transport: epDhtNode,
            connectionsView: epDhtNode.getConnectionsView(),
            serviceId: STREAM_ID1
        })
        stream1Node2 = new DhtNode({
            transport: node1,
            connectionsView: node1.getConnectionsView(),
            serviceId: STREAM_ID1
        })

        stream2Node1 = new DhtNode({
            transport: epDhtNode,
            connectionsView: epDhtNode.getConnectionsView(),
            serviceId: STREAM_ID2
        })
        stream2Node2 = new DhtNode({
            transport: node2,
            connectionsView: node2.getConnectionsView(),
            serviceId: STREAM_ID2
        })

        await Promise.all([stream1Node1.start(), stream1Node2.start(), stream2Node1.start(), stream2Node2.start()])
    })

    afterEach(async () => {
        await Promise.all([
            node1.stop(),
            node2.stop(),
            epDhtNode.stop(),
            stream1Node1.stop(),
            stream1Node2.stop(),
            stream2Node1.stop(),
            stream2Node2.stop()
        ])
    })

    it('Happy path', async () => {
        await Promise.all([node1.joinDht([epPeerDescriptor]), node2.joinDht([epPeerDescriptor])])
        await Promise.all([stream1Node1.joinDht([epPeerDescriptor]), stream1Node2.joinDht([epPeerDescriptor])])

        await Promise.all([stream2Node1.joinDht([epPeerDescriptor]), stream2Node2.joinDht([epPeerDescriptor])])
        expect(stream1Node1.getClosestContacts()).toHaveLength(1)
        expect(stream1Node2.getClosestContacts()).toHaveLength(1)
        expect(stream2Node1.getClosestContacts()).toHaveLength(1)
        expect(stream2Node2.getClosestContacts()).toHaveLength(1)

        expect(areEqualPeerDescriptors(stream1Node1.getClosestContacts()[0], node1.getLocalPeerDescriptor())).toBe(true)
        expect(areEqualPeerDescriptors(stream1Node2.getClosestContacts()[0], epPeerDescriptor)).toBe(true)
        expect(areEqualPeerDescriptors(stream2Node1.getClosestContacts()[0], node2.getLocalPeerDescriptor())).toBe(true)
        expect(areEqualPeerDescriptors(stream2Node2.getClosestContacts()[0], epPeerDescriptor)).toBe(true)
    })
})

import { LatencyType, PeerDescriptor, Simulator, SimulatorTransport } from '@streamr/dht'
import { StreamPartIDUtils, until } from '@streamr/utils'
import { NetworkStack } from '../../src/NetworkStack'
import { streamPartIdToDataKey } from '../../src/logic/ContentDeliveryManager'
import { Any } from '../../generated/google/protobuf/any'
import { createMockPeerDescriptor, createStreamMessage } from '../utils/utils'
import { randomUserId } from '@streamr/test-utils'

const STREAM_PART_ID = StreamPartIDUtils.parse('stream#0')

describe('Joining stream parts on offline nodes', () => {
    const entryPointPeerDescriptor: PeerDescriptor = createMockPeerDescriptor()
    const node1PeerDescriptor: PeerDescriptor = createMockPeerDescriptor()
    const node2PeerDescriptor: PeerDescriptor = createMockPeerDescriptor()
    const offlineDescriptor1: PeerDescriptor = createMockPeerDescriptor()
    const offlineDescriptor2: PeerDescriptor = createMockPeerDescriptor()

    let entryPoint: NetworkStack
    let node1: NetworkStack
    let node2: NetworkStack
    let simulator: Simulator

    beforeEach(async () => {
        simulator = new Simulator(LatencyType.REAL)
        const entryPointTransport = new SimulatorTransport(entryPointPeerDescriptor, simulator)
        entryPoint = new NetworkStack({
            layer0: {
                transport: entryPointTransport,
                connectionsView: entryPointTransport,
                peerDescriptor: entryPointPeerDescriptor,
                entryPoints: [entryPointPeerDescriptor]
            }
        })
        const node1Transport = new SimulatorTransport(node1PeerDescriptor, simulator)
        node1 = new NetworkStack({
            layer0: {
                transport: node1Transport,
                connectionsView: node1Transport,
                peerDescriptor: node1PeerDescriptor,
                entryPoints: [entryPointPeerDescriptor]
            }
        })
        const node2Transport = new SimulatorTransport(node2PeerDescriptor, simulator)
        node2 = new NetworkStack({
            layer0: {
                transport: node2Transport,
                connectionsView: node2Transport,
                peerDescriptor: node2PeerDescriptor,
                entryPoints: [entryPointPeerDescriptor]
            }
        })
        await entryPointTransport.start()
        await node1Transport.start()
        await node2Transport.start()
        await entryPoint.start()
        await node1.start()
        await node2.start()
    })

    afterEach(async () => {
        await entryPoint.stop()
        await node1.stop()
        await node2.stop()
        simulator.stop()
    })

    it('should recover if discovered nodes are offline', async () => {
        let messageReceived = false

        // store offline peer descriptors to DHT
        await entryPoint
            .getControlLayerNode()
            .storeDataToDht(streamPartIdToDataKey(STREAM_PART_ID), Any.pack(offlineDescriptor1, PeerDescriptor))
        await entryPoint
            .getControlLayerNode()
            .storeDataToDht(streamPartIdToDataKey(STREAM_PART_ID), Any.pack(offlineDescriptor2, PeerDescriptor))

        node1.getContentDeliveryManager().joinStreamPart(STREAM_PART_ID)
        node1.getContentDeliveryManager().on('newMessage', () => {
            messageReceived = true
        })
        const msg = createStreamMessage(JSON.stringify({ hello: 'WORLD' }), STREAM_PART_ID, randomUserId())
        node2.getContentDeliveryManager().broadcast(msg)
        await until(() => messageReceived, 40000)
    }, 60000)
})

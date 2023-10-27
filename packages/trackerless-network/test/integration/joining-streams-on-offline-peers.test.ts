import { NodeType, PeerDescriptor, Simulator, SimulatorTransport, LatencyType } from '@streamr/dht'
import { NetworkStack } from '../../src/NetworkStack'
import { streamPartIdToDataKey } from '../../src/logic/EntryPointDiscovery'
import { StreamPartIDUtils } from '@streamr/protocol'
import { Any } from '../../src/proto/google/protobuf/any'
import { createStreamMessage } from '../utils/utils'
import { waitForCondition } from '@streamr/utils'
import { randomEthereumAddress } from '@streamr/test-utils'

const STREAM_PART_ID = StreamPartIDUtils.parse('stream#0')

describe('Joining stream parts on offline nodes', () => {

    const entryPointPeerDescriptor: PeerDescriptor = {
        kademliaId: new Uint8Array([1, 2, 3]),
        type: NodeType.NODEJS
    }

    const node1PeerDescriptor: PeerDescriptor = {
        kademliaId: new Uint8Array([1, 1, 1]),
        type: NodeType.NODEJS
    }

    const node2PeerDescriptor: PeerDescriptor = {
        kademliaId: new Uint8Array([2, 2, 2]),
        type: NodeType.NODEJS
    }

    const offlineDescriptor1: PeerDescriptor = {
        kademliaId: new Uint8Array([3, 3, 3]),
        type: NodeType.NODEJS
    }

    const offlineDescriptor2: PeerDescriptor = {
        kademliaId: new Uint8Array([4, 4, 4]),
        type: NodeType.NODEJS
    }

    let entryPoint: NetworkStack
    let node1: NetworkStack
    let node2: NetworkStack
    let simulator: Simulator

    beforeEach(async () => {
        simulator = new Simulator(LatencyType.RANDOM)
        const entryPointTransport = new SimulatorTransport(entryPointPeerDescriptor, simulator)
        entryPoint = new NetworkStack({
            layer0: {
                transportLayer: entryPointTransport,
                peerDescriptor: entryPointPeerDescriptor,
                entryPoints: [entryPointPeerDescriptor]
            }
        })
        const node1Transport = new SimulatorTransport(node1PeerDescriptor, simulator)
        node1 = new NetworkStack({
            layer0: {
                transportLayer: node1Transport,
                peerDescriptor: node1PeerDescriptor,
                entryPoints: [entryPointPeerDescriptor]
            }
        })
        const node2Transport = new SimulatorTransport(node2PeerDescriptor, simulator)
        node2 = new NetworkStack({
            layer0: {
                transportLayer: node2Transport,
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
        await entryPoint.getLayer0DhtNode().storeDataToDht(streamPartIdToDataKey(STREAM_PART_ID), Any.pack(offlineDescriptor1, PeerDescriptor))
        await entryPoint.getLayer0DhtNode().storeDataToDht(streamPartIdToDataKey(STREAM_PART_ID), Any.pack(offlineDescriptor2, PeerDescriptor))
        
        node1.getStreamrNode().joinStreamPart(STREAM_PART_ID)
        node1.getStreamrNode().on('newMessage', () => { messageReceived = true })
        const msg = createStreamMessage(JSON.stringify({ hello: 'WORLD' }), STREAM_PART_ID, randomEthereumAddress())
        node2.getStreamrNode().broadcast(msg)
        await waitForCondition(() => messageReceived, 40000)
    }, 60000)

})

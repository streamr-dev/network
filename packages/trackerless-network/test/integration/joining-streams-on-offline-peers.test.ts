import { NodeType, PeerDescriptor, Simulator, SimulatorTransport, LatencyType } from '@streamr/dht'
import { NetworkStack } from '../../src/NetworkStack'
import { streamPartIdToDataKey } from '../../src/logic/StreamEntryPointDiscovery'
import { StreamPartIDUtils } from '@streamr/protocol'
import { Any } from '../../src/proto/google/protobuf/any'
import { createStreamMessage } from '../utils/utils'
import { waitForCondition } from '@streamr/utils'
import { randomEthereumAddress } from '@streamr/test-utils'

describe('Joining streams on offline nodes', () => {
    const streamPartId = StreamPartIDUtils.parse('stream#0')

    const entryPointPeerDescriptor: PeerDescriptor = {
        kademliaId: new Uint8Array([1, 2, 3]),
        nodeName: 'entrypoint',
        type: NodeType.NODEJS
    }

    const node1PeerDescriptor: PeerDescriptor = {
        kademliaId: new Uint8Array([1, 1, 1]),
        nodeName: 'node1',
        type: NodeType.NODEJS
    }

    const node2PeerDescriptor: PeerDescriptor = {
        kademliaId: new Uint8Array([2, 2, 2]),
        nodeName: 'node2',
        type: NodeType.NODEJS
    }

    const offlineDescriptor1: PeerDescriptor = {
        kademliaId: new Uint8Array([3, 3, 3]),
        nodeName: 'offline',
        type: NodeType.NODEJS
    }

    const offlineDescriptor2: PeerDescriptor = {
        kademliaId: new Uint8Array([4, 4, 4]),
        nodeName: 'offline',
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

        node1 = new NetworkStack({
            layer0: {
                transportLayer: new SimulatorTransport(node1PeerDescriptor, simulator),
                peerDescriptor: node1PeerDescriptor,
                entryPoints: [entryPointPeerDescriptor]
            }
        })

        node2 = new NetworkStack({
            layer0: {
                transportLayer: new SimulatorTransport(node2PeerDescriptor, simulator),
                peerDescriptor: node2PeerDescriptor,
                entryPoints: [entryPointPeerDescriptor]
            }
        })

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
        await entryPoint.getLayer0DhtNode().storeDataToDht(streamPartIdToDataKey(streamPartId), Any.pack(offlineDescriptor1, PeerDescriptor))
        await entryPoint.getLayer0DhtNode().storeDataToDht(streamPartIdToDataKey(streamPartId), Any.pack(offlineDescriptor2, PeerDescriptor))
        
        node1.getStreamrNode().joinStreamPart(streamPartId)
        node1.getStreamrNode().on('newMessage', () => { messageReceived = true })
        const msg = createStreamMessage(JSON.stringify({ hello: 'WORLD' }), streamPartId, randomEthereumAddress())
        node2.getStreamrNode().broadcast(msg)
        await waitForCondition(() => messageReceived, 25000)
    }, 30000)

})

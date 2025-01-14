import { LatencyType, Simulator, SimulatorTransport } from '@streamr/dht'
import { StreamPartIDUtils, until } from '@streamr/utils'
import { range } from 'lodash'
import { NetworkStack } from '../../src/NetworkStack'
import { MAX_NODE_COUNT } from '../../src/logic/PeerDescriptorStoreManager'
import { createMockPeerDescriptor, createStreamMessage } from '../utils/utils'
import { randomUserId } from '@streamr/test-utils'

describe('Stream Entry Points are replaced when known entry points leave streams', () => {
    let simulator: Simulator
    let layer0EntryPoint: NetworkStack
    const entryPointPeerDescriptor = createMockPeerDescriptor()
    let initialNodesOnStream: NetworkStack[]
    let laterNodesOnStream: NetworkStack[]
    let newNodeInStream: NetworkStack

    const NUM_OF_LATER_NODES = 16

    const STREAM_PART_ID = StreamPartIDUtils.parse('stream#0')

    const startNode = async () => {
        const peerDescriptor = createMockPeerDescriptor()
        const transport = new SimulatorTransport(peerDescriptor, simulator)
        await transport.start()
        const node = new NetworkStack({
            layer0: {
                transport,
                connectionsView: transport,
                peerDescriptor,
                entryPoints: [entryPointPeerDescriptor]
            }
        })
        await node.start()
        return node
    }

    beforeEach(async () => {
        simulator = new Simulator(LatencyType.REAL)
        const entryPointTransport = new SimulatorTransport(entryPointPeerDescriptor, simulator)
        layer0EntryPoint = new NetworkStack({
            layer0: {
                transport: entryPointTransport,
                connectionsView: entryPointTransport,
                peerDescriptor: entryPointPeerDescriptor,
                entryPoints: [entryPointPeerDescriptor]
            }
        })
        await entryPointTransport.start()
        await layer0EntryPoint.start()

        initialNodesOnStream = await Promise.all(
            range(MAX_NODE_COUNT).map(async () => {
                return await startNode()
            })
        )

        laterNodesOnStream = await Promise.all(
            range(NUM_OF_LATER_NODES).map(async () => {
                return await startNode()
            })
        )
        newNodeInStream = await startNode()
    })

    afterEach(async () => {
        await Promise.all([
            layer0EntryPoint.stop(),
            ...initialNodesOnStream.map((node) => node.stop()),
            ...laterNodesOnStream.map((node) => node.stop()),
            newNodeInStream.stop()
        ])
        simulator.stop()
    })

    // TODO: Investigate why 60 second timeouts are needed
    it('stream entry points are replaced when nodes leave streams', async () => {
        await Promise.all(
            initialNodesOnStream.map((node) => node.joinStreamPart(STREAM_PART_ID, { minCount: 4, timeout: 60000 }))
        )

        let receivedMessages = 0
        for (const node of laterNodesOnStream) {
            await node.joinStreamPart(STREAM_PART_ID, { minCount: 4, timeout: 60000 })
            node.getContentDeliveryManager().on('newMessage', () => {
                receivedMessages += 1
            })
        }

        await Promise.all(
            initialNodesOnStream.map((node) => node.getContentDeliveryManager().leaveStreamPart(STREAM_PART_ID))
        )
        await until(
            () =>
                laterNodesOnStream.every(
                    (node) => node.getContentDeliveryManager().getNeighbors(STREAM_PART_ID).length >= 4
                ),
            60000,
            1000
        )

        const msg = createStreamMessage(JSON.stringify({ hello: 'WORLD' }), STREAM_PART_ID, randomUserId())
        newNodeInStream.getContentDeliveryManager().broadcast(msg)
        await until(() => receivedMessages === NUM_OF_LATER_NODES, 30000)
    }, 200000)
})

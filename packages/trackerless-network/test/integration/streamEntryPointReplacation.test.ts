import { Simulator, SimulatorTransport, LatencyType } from '@streamr/dht'
import { NetworkStack } from '../../src/NetworkStack'
import { createMockPeerDescriptor, createStreamMessage } from '../utils/utils'
import { ENTRYPOINT_STORE_LIMIT } from '../../src/logic/EntryPointDiscovery'
import { range } from 'lodash'
import { StreamPartIDUtils } from '@streamr/protocol'
import { waitForCondition } from '@streamr/utils'
import { randomEthereumAddress } from '@streamr/test-utils'

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
                peerDescriptor: entryPointPeerDescriptor,
                entryPoints: [entryPointPeerDescriptor]
            }
        })
        await entryPointTransport.start()
        await layer0EntryPoint.start()

        initialNodesOnStream = []
        await Promise.all(range(ENTRYPOINT_STORE_LIMIT).map(async () => {
            const node = await startNode()
            initialNodesOnStream.push(node)
        }))

        laterNodesOnStream = []
        await Promise.all(range(NUM_OF_LATER_NODES).map(async () => {
            const node = await startNode()
            laterNodesOnStream.push(node)
        }))
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

    it('stream entry points are replaced when nodes leave streams', async () => {
        let receivedMessages = 0

        await Promise.all(initialNodesOnStream.map((node) => node.joinStreamPart(STREAM_PART_ID, { minCount: 4, timeout: 15000 })))

        for (const node of laterNodesOnStream) {
            await node.joinStreamPart(STREAM_PART_ID, { minCount: 4, timeout: 15000 }) 
            node.getStreamrNode().on('newMessage', () => {
                receivedMessages += 1
            })
        }

        await Promise.all(initialNodesOnStream.map((node) => node.getStreamrNode().leaveStreamPart(STREAM_PART_ID)))
        await waitForCondition(() => laterNodesOnStream.every((node) => node.getStreamrNode().getNeighbors(STREAM_PART_ID).length >= 4), 30000, 1000)

        const msg = createStreamMessage(
            JSON.stringify({ hello: 'WORLD' }),
            STREAM_PART_ID,
            randomEthereumAddress()
        )
        await newNodeInStream.getStreamrNode().broadcast(msg)
        await waitForCondition(() => receivedMessages === NUM_OF_LATER_NODES, 10000)
    }, 200000)
})

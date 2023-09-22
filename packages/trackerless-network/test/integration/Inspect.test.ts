import { LatencyType, NodeType, PeerDescriptor, Simulator, SimulatorTransport } from '@streamr/dht'
import { NetworkStack } from '../../src/NetworkStack'
import { range } from 'lodash'
import { createRandomNodeId, createStreamMessage } from '../utils/utils'
import { hexToBinary } from '@streamr/utils'
import { StreamPartIDUtils } from '@streamr/protocol'
import { randomEthereumAddress } from '@streamr/test-utils'

describe('inspect', () => {

    let simulator: Simulator

    const streamPartId = StreamPartIDUtils.parse('stream#0')
    let sequenceNumber: number

    const publisherDescriptor: PeerDescriptor = {
        kademliaId: hexToBinary(createRandomNodeId()),
        type: NodeType.NODEJS,
    }

    const inspectorPeerDescriptor: PeerDescriptor = {
        kademliaId: hexToBinary(createRandomNodeId()),
        type: NodeType.NODEJS,
    }

    const inspectedNodeCount = 12

    let publisherNode: NetworkStack
    let inspectorNode: NetworkStack
    let inspectedNodes: NetworkStack[]

    let publishInterval: NodeJS.Timeout

    const initiateNode = async (peerDescriptor: PeerDescriptor, simulator: Simulator): Promise<NetworkStack> => {
        const transportLayer = new SimulatorTransport(peerDescriptor, simulator)
        const node = new NetworkStack({
            layer0: {
                entryPoints: [publisherDescriptor],
                peerDescriptor,
                transportLayer
            }
        })
        await node.start()
        return node
    }

    beforeEach(async () => {
        Simulator.useFakeTimers()
        simulator = new Simulator(LatencyType.RANDOM)

        publisherNode = await initiateNode(publisherDescriptor, simulator)
        inspectorNode = await initiateNode(inspectorPeerDescriptor, simulator)

        inspectedNodes = []
        await Promise.all(range(inspectedNodeCount).map(async () => {
            const peerDescriptor: PeerDescriptor = {
                kademliaId: hexToBinary(createRandomNodeId()),
                type: NodeType.NODEJS
            }
            const node = await initiateNode(peerDescriptor, simulator)
            inspectedNodes.push(node)
        }))
        await Promise.all([
            publisherNode.getStreamrNode().waitForJoinAndSubscribe(streamPartId, 5000, 4),
            inspectorNode.getStreamrNode().waitForJoinAndSubscribe(streamPartId, 5000, 4),
            ...inspectedNodes.map((node) => node.getStreamrNode().waitForJoinAndSubscribe(streamPartId, 5000, 4))
        ])
        sequenceNumber = 0
    }, 30000)

    afterEach(async () => {
        clearInterval(publishInterval)
        await Promise.all([
            publisherNode.stop(),
            inspectorNode.stop(),
            ...inspectedNodes.map((node) => node.stop())
        ])
        Simulator.useFakeTimers(false)
    })

    it('gets successful inspections from all suspects', async () => {
        publishInterval = setInterval(async () => {
            const msg = createStreamMessage(
                JSON.stringify({ hello: 'WORLD' }),
                streamPartId,
                randomEthereumAddress(),
                123123,
                sequenceNumber
            )
            await publisherNode.getStreamrNode().publishToStream(msg)
            sequenceNumber += 1
        }, 200)

        for (const node of inspectedNodes) {
            const result = await inspectorNode.getStreamrNode().inspect(node.getLayer0DhtNode().getPeerDescriptor(), streamPartId)
            expect(result).toEqual(true)
        }
    }, 25000)

})

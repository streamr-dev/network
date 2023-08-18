import { LatencyType, NodeType, PeerDescriptor, PeerID, Simulator, SimulatorTransport } from '@streamr/dht'
import { NetworkStack } from '../../src/NetworkStack'
import { range } from 'lodash'
import { createStreamMessage } from '../utils/utils'

describe('inspect', () => {

    let simulator: Simulator

    const streamId = 'stream#0'
    let sequenceNumber: number

    const publisherDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString('publisher').value,
        type: NodeType.NODEJS,
    }

    const inspectorPeerDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString('inspector').value,
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
            },
            networkNode: {}
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
        await Promise.all(range(inspectedNodeCount).map(async (i) => {
            const peerDescriptor: PeerDescriptor = {
                kademliaId: PeerID.fromString(`inspected${i}`).value,
                type: NodeType.NODEJS
            }
            const node = await initiateNode(peerDescriptor, simulator)
            inspectedNodes.push(node)
        }))
        await Promise.all([
            publisherNode.getStreamrNode().waitForJoinAndSubscribe(streamId, 5000, 4),
            inspectorNode.getStreamrNode().waitForJoinAndSubscribe(streamId, 5000, 4),
            ...inspectedNodes.map((node) => node.getStreamrNode().waitForJoinAndSubscribe(streamId, 5000, 4))
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
                'stream',
                new TextEncoder().encode('publisher'),
                123123,
                sequenceNumber
            )
            await publisherNode.getStreamrNode().publishToStream(streamId, msg)
            sequenceNumber += 1
        }, 200)

        for (const node of inspectedNodes) {
            const result = await inspectorNode.getStreamrNode().inspect(node.getLayer0DhtNode().getPeerDescriptor(), streamId)
            expect(result).toEqual(true)
        }
    }, 25000)

})

import { LatencyType, PeerDescriptor, Simulator, SimulatorTransport } from '@streamr/dht'
import { StreamPartIDUtils } from '@streamr/utils'
import { range } from 'lodash'
import { NetworkStack } from '../../src/NetworkStack'
import { createMockPeerDescriptor, createStreamMessage } from '../utils/utils'
import { randomUserId } from '@streamr/test-utils'

describe('inspect', () => {
    let simulator: Simulator

    const streamPartId = StreamPartIDUtils.parse('stream#0')
    let sequenceNumber: number

    const publisherDescriptor = createMockPeerDescriptor()
    const inspectorPeerDescriptor = createMockPeerDescriptor()

    const inspectedNodeCount = 12

    let publisherNode: NetworkStack
    let inspectorNode: NetworkStack
    let inspectedNodes: NetworkStack[]

    let publishInterval: NodeJS.Timeout

    const initiateNode = async (peerDescriptor: PeerDescriptor, simulator: Simulator): Promise<NetworkStack> => {
        const transport = new SimulatorTransport(peerDescriptor, simulator)
        await transport.start()
        const node = new NetworkStack({
            layer0: {
                entryPoints: [publisherDescriptor],
                peerDescriptor,
                transport,
                connectionsView: transport
            }
        })
        await node.start()
        return node
    }

    beforeEach(async () => {
        simulator = new Simulator(LatencyType.REAL)

        publisherNode = await initiateNode(publisherDescriptor, simulator)
        inspectorNode = await initiateNode(inspectorPeerDescriptor, simulator)

        inspectedNodes = []
        await Promise.all(
            range(inspectedNodeCount).map(async () => {
                const peerDescriptor = createMockPeerDescriptor()
                const node = await initiateNode(peerDescriptor, simulator)
                inspectedNodes.push(node)
            })
        )
        await Promise.all([
            publisherNode.joinStreamPart(streamPartId, { minCount: 4, timeout: 15000 }),
            inspectorNode.joinStreamPart(streamPartId, { minCount: 4, timeout: 15000 }),
            ...inspectedNodes.map((node) => node.joinStreamPart(streamPartId, { minCount: 4, timeout: 15000 }))
        ])
        sequenceNumber = 0
    }, 30000)

    afterEach(async () => {
        clearInterval(publishInterval)
        await Promise.all([publisherNode.stop(), inspectorNode.stop(), ...inspectedNodes.map((node) => node.stop())])
    })

    it('gets successful inspections from all suspects', async () => {
        publishInterval = setInterval(async () => {
            const msg = createStreamMessage(
                JSON.stringify({ hello: 'WORLD' }),
                streamPartId,
                randomUserId(),
                123123,
                sequenceNumber
            )
            publisherNode.getContentDeliveryManager().broadcast(msg)
            sequenceNumber += 1
        }, 200)

        for (const node of inspectedNodes) {
            const result = await inspectorNode
                .getContentDeliveryManager()
                .inspect(node.getControlLayerNode().getLocalPeerDescriptor(), streamPartId)
            expect(result).toEqual(true)
        }
    }, 25000)
})

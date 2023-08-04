import { NodeType, PeerDescriptor, PeerID, Simulator, SimulatorTransport } from "@streamr/dht"
import { NetworkStack } from "../../src/NetworkStack"
import { range } from 'lodash'
import { createStreamMessage } from "../utils/utils"
import { ContentMessage } from "../../src/proto/packages/trackerless-network/protos/NetworkRpc"

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

    beforeEach(async () => {
        simulator = new Simulator()
        const publisherTransport = new SimulatorTransport(publisherDescriptor, simulator)
        publisherNode = new NetworkStack({
            layer0: {
                entryPoints: [publisherDescriptor],
                peerDescriptor: publisherDescriptor,
                transportLayer: publisherTransport
            },
            networkNode: {}
        })
        await publisherNode.start()
        await publisherNode.getLayer0DhtNode().joinDht(publisherDescriptor)

        const inspectorTransport = new SimulatorTransport(inspectorPeerDescriptor, simulator)
        inspectorNode = new NetworkStack({
            layer0: {
                entryPoints: [publisherDescriptor],
                peerDescriptor: inspectorPeerDescriptor,
                transportLayer: inspectorTransport
            },
            networkNode: {}
        })
        await inspectorNode.start()
        await inspectorNode.getLayer0DhtNode().joinDht(publisherDescriptor)
        
        inspectedNodes = []
        range(inspectedNodeCount).forEach((i) => {
            const peerDescriptor: PeerDescriptor = {
                kademliaId: PeerID.fromString(`inspected${i}`).value,
                type: NodeType.NODEJS,
            }
            const transport = new SimulatorTransport(peerDescriptor, simulator)
            const node = new NetworkStack({
                layer0: {
                    entryPoints: [publisherDescriptor],
                    peerDescriptor,
                    transportLayer: transport
                },
                networkNode: {}
            })
            inspectedNodes.push(node)
        })

        await Promise.all(inspectedNodes.map(async (node) => {
            await node.start()
            await node.getLayer0DhtNode().joinDht(publisherDescriptor)
        }))
        await Promise.all([
            publisherNode.getStreamrNode().waitForJoinAndSubscribe(streamId, 5000, 4),
            inspectorNode.getStreamrNode().waitForJoinAndSubscribe(streamId, 5000, 4),
            ...inspectedNodes.map((node) => node.getStreamrNode().waitForJoinAndSubscribe(streamId, 5000, 4))
        ])

        sequenceNumber = 0
    })

    afterEach(async () => {
        clearInterval(publishInterval)
        await Promise.all([
            publisherNode.stop(),
            inspectorNode.stop(),
            ...inspectedNodes.map((node) => node.stop())
        ])
    })

    it('gets successful inspections from all suspects', async () => {
        publishInterval = setInterval(async () => {
            const content: ContentMessage = {
                body: JSON.stringify({ hello: "WORLD" })
            }
            const msg = createStreamMessage(
                content,
                'stream',
                'publisher',
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
    }, 15000)

})

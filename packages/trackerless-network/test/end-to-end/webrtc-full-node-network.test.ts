import { DhtNode, PeerDescriptor, NodeType, ConnectionManager, PeerID } from '@streamr/dht'
import { StreamrNode, Event as StreamrNodeEvent } from '../../src/logic/StreamrNode'
import { range } from 'lodash'
import { waitForCondition } from 'streamr-test-utils'
import { ContentMessage } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { getRandomRegion } from '@streamr/dht/dist/test/data/pings'
import { createStreamMessage } from '../utils'

describe('Full node network with WebRTC connections', () => {

    const NUM_OF_NODES = 32

    const epPeerDescriptor: PeerDescriptor = {
        peerId: PeerID.fromString(`entrypoint`).value,
        type: NodeType.NODEJS,
        websocket: { ip: 'localhost', port: 14444 },
        region: getRandomRegion()
    }

    const randomGraphId = 'webrtc-network'

    let epConnectionManager: ConnectionManager
    let epStreamrNode: StreamrNode

    let connectionManagers: ConnectionManager[]
    let streamrNodes: StreamrNode[]

    let layer0Ep: DhtNode
    let layer0DhtNodes: DhtNode[]

    beforeEach(async () => {

        streamrNodes = []
        connectionManagers = []
        layer0DhtNodes = []

        layer0Ep = new DhtNode({ peerDescriptor: epPeerDescriptor, numberOfNodesPerKBucket: 4, routeMessageTimeout: 10000 })

        await layer0Ep.start()
        await layer0Ep.joinDht(epPeerDescriptor)

        epConnectionManager = layer0Ep.getTransport() as ConnectionManager
        epStreamrNode = new StreamrNode()
        await epStreamrNode.start(layer0Ep, epConnectionManager, epConnectionManager)

        await epStreamrNode.joinStream(randomGraphId, epPeerDescriptor)

        await Promise.all(range(NUM_OF_NODES).map(async (i) => {
            const peerId = PeerID.fromString(`${i}`)
            const peerDescriptor: PeerDescriptor = {
                peerId: peerId.value,
                type: NodeType.NODEJS,
                region: getRandomRegion()
            }

            // console.log(i, peerId.toKey())

            const layer0 = new DhtNode({
                numberOfNodesPerKBucket: 4,
                peerDescriptor,
                routeMessageTimeout: 2000,
                entryPoints: [epPeerDescriptor]
            })

            layer0DhtNodes.push(layer0)

            await layer0.start()
            await layer0.joinDht(epPeerDescriptor)

            const connectionManager = layer0.getTransport() as ConnectionManager
            const streamrNode = new StreamrNode()
            await streamrNode.start(layer0, connectionManager, connectionManager)

            return await streamrNode.joinStream(randomGraphId, epPeerDescriptor).then(() => {
                streamrNode.subscribeToStream(randomGraphId, epPeerDescriptor)
                connectionManagers.push(connectionManager)
                streamrNodes.push(streamrNode)
            })
        }))

    }, 90000)

    afterEach(async () => {
        await Promise.all([
            epStreamrNode.destroy(),
            ...streamrNodes.map((streamrNode) => streamrNode.destroy()),
            layer0Ep.stop(),
            ...layer0DhtNodes.map((dhtNode) => dhtNode.stop()),
            epConnectionManager.stop(),
            ...connectionManagers.map((cm) => cm.stop()),
        ])
    })

    it('happy path', async () => {

        await Promise.all([...streamrNodes.map((streamrNode) =>
            waitForCondition(() =>
                streamrNode.getStream(randomGraphId)!.layer2.getTargetNeighborStringIds().length >= 3
                && !streamrNode.getStream(randomGraphId)!.layer1.isJoinOngoing()
            , 60000
            )
        )])

        let numOfMessagesReceived = 0

        const successIds = []
        streamrNodes.map((streamrNode) => {
            streamrNode.on(StreamrNodeEvent.NEW_MESSAGE, () => {
                successIds.push(PeerID.fromValue(streamrNode.getPeerDescriptor().peerId).toKey())
                numOfMessagesReceived += 1
            })
        })

        const content: ContentMessage = {
            body: JSON.stringify({ hello: "WORLD" })
        }
        const msg = createStreamMessage(
            content,
            randomGraphId,
            PeerID.fromValue(epPeerDescriptor.peerId).toString()
        )

        epStreamrNode.publishToStream(randomGraphId, epPeerDescriptor, msg)

        await waitForCondition(() => numOfMessagesReceived === NUM_OF_NODES)

    }, 120000)

})

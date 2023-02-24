import { DhtNode, PeerDescriptor, NodeType, ConnectionManager, PeerID, keyFromPeerDescriptor, peerIdFromPeerDescriptor } from '@streamr/dht'
import { StreamrNode } from '../../src/logic/StreamrNode'
import { range } from 'lodash'
import { waitForCondition } from '@streamr/utils'
import { ContentMessage } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { getRandomRegion } from '@streamr/dht/dist/test/data/pings'
import { createStreamMessage } from '../utils'
import { PeerIDKey } from '@streamr/dht/dist/src/helpers/PeerID'

describe('Full node network with WebRTC connections', () => {

    const NUM_OF_NODES = 22

    const epPeerDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString(`entrypoint`).value,
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

        layer0Ep = new DhtNode({ peerDescriptor: epPeerDescriptor, numberOfNodesPerKBucket: 8, routeMessageTimeout: 10000 })

        await layer0Ep.start()
        await layer0Ep.joinDht(epPeerDescriptor)

        epConnectionManager = layer0Ep.getTransport() as ConnectionManager
        epStreamrNode = new StreamrNode({})
        await epStreamrNode.start(layer0Ep, epConnectionManager, epConnectionManager)

        await epStreamrNode.joinStream(randomGraphId, epPeerDescriptor)

        await Promise.all(range(NUM_OF_NODES).map(async (i) => {
            const peerId = PeerID.fromString(`${i}`)
            const peerDescriptor: PeerDescriptor = {
                kademliaId: peerId.value,
                type: NodeType.NODEJS,
                region: getRandomRegion()
            }

            const layer0 = new DhtNode({
                numberOfNodesPerKBucket: 8,
                peerDescriptor,
                routeMessageTimeout: 2000,
                entryPoints: [epPeerDescriptor]
            })

            layer0DhtNodes.push(layer0)

            await layer0.start()
            await layer0.joinDht(epPeerDescriptor)

            const connectionManager = layer0.getTransport() as ConnectionManager
            const streamrNode = new StreamrNode({})
            await streamrNode.start(layer0, connectionManager, connectionManager)

            return await streamrNode.joinStream(randomGraphId, epPeerDescriptor).then(() => {
                streamrNode.subscribeToStream(randomGraphId, epPeerDescriptor)
                connectionManagers.push(connectionManager)
                streamrNodes.push(streamrNode)
                return
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
            waitForCondition(() => {
                return streamrNode.getStream(randomGraphId)!.layer2.getTargetNeighborStringIds().length >= 3
                    && !streamrNode.getStream(randomGraphId)!.layer1.isJoinOngoing()
            }
            , 60000
            )
        )])
        let numOfMessagesReceived = 0
        const successIds: PeerIDKey[] = []
        streamrNodes.map((streamrNode) => {
            streamrNode.on('newMessage', () => {
                successIds.push(keyFromPeerDescriptor(streamrNode.getPeerDescriptor()))
                numOfMessagesReceived += 1
            })
        })
        const content: ContentMessage = {
            body: JSON.stringify({ hello: "WORLD" })
        }
        const msg = createStreamMessage(
            content,
            randomGraphId,
            peerIdFromPeerDescriptor(epPeerDescriptor).toString()
        )
        epStreamrNode.publishToStream(randomGraphId, epPeerDescriptor, msg)
        await waitForCondition(() => numOfMessagesReceived === NUM_OF_NODES)
    }, 120000)

})

import { DhtNode, PeerDescriptor, NodeType, ConnectionManager, PeerID, peerIdFromPeerDescriptor } from '@streamr/dht'
import { StreamrNode } from '../../src/logic/StreamrNode'
import { range } from 'lodash'
import { waitForCondition } from '@streamr/utils'
import { ContentMessage } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { createStreamMessage } from '../utils'

describe('Full node network with WebSocket connections only', () => {

    const NUM_OF_NODES = 48
    const epPeerDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString(`entrypoint`).value,
        type: NodeType.NODEJS,
        nodeName: 'entrypoint',
        websocket: { ip: 'localhost', port: 15555 }
    }
    const randomGraphId = 'websocket-network'
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
        layer0Ep = new DhtNode({ peerDescriptor: epPeerDescriptor,  nodeName: 'entrypoint', numberOfNodesPerKBucket: 4, routeMessageTimeout: 10000 })
        await layer0Ep.start()
        await layer0Ep.joinDht(epPeerDescriptor)
        epConnectionManager = layer0Ep.getTransport() as ConnectionManager
        epStreamrNode = new StreamrNode({})
        await epStreamrNode.start(layer0Ep, epConnectionManager, epConnectionManager)
        await epStreamrNode.joinStream(randomGraphId, epPeerDescriptor)
        await Promise.all(range(NUM_OF_NODES).map(async (i) => {
            const layer0 = new DhtNode({
                routeMessageTimeout: 10000,
                entryPoints: [epPeerDescriptor],
                webSocketPort: 15556 + i,
                webSocketHost: 'localhost',
                peerIdString: `${i}`,
                nodeName: `${i}`,
                numberOfNodesPerKBucket: 4
            })
            layer0DhtNodes.push(layer0)
            await layer0.start()
            await layer0.joinDht(epPeerDescriptor)
            const connectionManager = layer0.getTransport() as ConnectionManager
            const streamrNode = new StreamrNode({ nodeName: `${i}` })
            await streamrNode.start(layer0, connectionManager, connectionManager)
            return await streamrNode.joinStream(randomGraphId, epPeerDescriptor).then(() => {
                streamrNode.subscribeToStream(randomGraphId, epPeerDescriptor)
                connectionManagers.push(connectionManager)
                streamrNodes.push(streamrNode)
                return
            })
        }))

    }, 120000)

    afterEach(async () => {
        await Promise.all([
            epStreamrNode.destroy(),
            ...streamrNodes.map((streamrNode) => streamrNode.destroy()),
            epConnectionManager.stop(),
            ...connectionManagers.map((cm) => cm.stop()),
            layer0Ep.stop(),
            ...layer0DhtNodes.map((dhtNode) => dhtNode.stop())
        ])
    })

    it('happy path', async () => {

        await Promise.all([...streamrNodes.map((streamrNode) =>
            waitForCondition(() => {
                return streamrNode.getStream(randomGraphId)!.layer2.getTargetNeighborStringIds().length >= 3
                    && !streamrNode.getStream(randomGraphId)!.layer1.isJoinOngoing()
            }
            , 160000
            )
        )])

        let numOfMessagesReceived = 0
        streamrNodes.map((streamrNode) => {
            streamrNode.on('newMessage', () => numOfMessagesReceived += 1)
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
    }, 220000)

})

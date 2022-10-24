import { DhtNode, PeerDescriptor, NodeType, ConnectionManager, PeerID } from '@streamr/dht'
import { StreamrNode, Event as StreamrNodeEvent } from '../../src/logic/StreamrNode'
import { range } from 'lodash'
import { waitForCondition } from 'streamr-test-utils'
import { DataMessage, MessageRef } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'

describe('Full node network with WebSocket connections only', () => {

    const NUM_OF_NODES = 64

    const epPeerDescriptor: PeerDescriptor = {
        peerId: PeerID.fromString(`entrypoint`).value,
        type: NodeType.NODEJS,
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

        layer0Ep = new DhtNode({ peerDescriptor: epPeerDescriptor, numberOfNodesPerKBucket: 4, routeMessageTimeout: 10000 })
        await layer0Ep.start()
        await layer0Ep.joinDht(epPeerDescriptor)

        epConnectionManager = layer0Ep.getTransport() as ConnectionManager
        epStreamrNode = new StreamrNode()
        await epStreamrNode.start(layer0Ep, epConnectionManager, epConnectionManager)

        await epStreamrNode.joinStream(randomGraphId, epPeerDescriptor)

        range(NUM_OF_NODES).map(async (i) => {
            setImmediate(async () => {

                const layer0 = new DhtNode({
                    routeMessageTimeout: 10000,
                    entryPoints: [epPeerDescriptor],
                    webSocketPort: 15556 + i,
                    webSocketHost: 'localhost',
                    peerIdString: `${i}`,
                    numberOfNodesPerKBucket: 4
                })

                layer0DhtNodes.push(layer0)

                await layer0.start()
                await layer0.joinDht(epPeerDescriptor)

                const connectionManager = layer0.getTransport() as ConnectionManager
                const streamrNode = new StreamrNode()
                await streamrNode.start(layer0, connectionManager, connectionManager)

                // await streamrNode.joinStream(randomGraphId, epPeerDescriptor)
                streamrNode.subscribeToStream(randomGraphId, epPeerDescriptor)
                connectionManagers.push(connectionManager)
                streamrNodes.push(streamrNode)
            })
        })

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

        await waitForCondition(() => streamrNodes.length === NUM_OF_NODES, 120000)
        await Promise.all([...streamrNodes.map((streamrNode) =>
            waitForCondition(() =>
                streamrNode.getStream(randomGraphId)!.layer2.getTargetNeighborStringIds().length >= 3
                && !streamrNode.getStream(randomGraphId)!.layer1.isJoinOngoing()
            , 90000
            )
        )])

        let numOfMessagesReceived = 0

        streamrNodes.map((streamrNode) => {
            streamrNode.on(StreamrNodeEvent.NEW_MESSAGE, () => numOfMessagesReceived += 1)
        })

        const messageRef: MessageRef = {
            sequenceNumber: 1,
            timestamp: BigInt(123123)
        }
        const message: DataMessage = {
            content: JSON.stringify({ hello: "WORLD" }),
            senderId: PeerID.fromValue(epStreamrNode.getPeerDescriptor().peerId).toString(),
            messageRef,
            streamPartId: randomGraphId
        }

        epStreamrNode.publishToStream(randomGraphId, epPeerDescriptor, message)

        await waitForCondition(() => numOfMessagesReceived === NUM_OF_NODES)

    }, 220000)

})

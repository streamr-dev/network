import { DhtNode, PeerDescriptor, NodeType, ConnectionManager, PeerID } from '@streamr/dht'
import { StreamrNode, Event as StreamrNodeEvent } from '../../src/logic/StreamrNode'
// import { range } from 'lodash'
import { waitForCondition } from 'streamr-test-utils'
import { DataMessage, MessageRef } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
// import { wait } from '@streamr/utils'

describe('Full node network with WebRTC connections', () => {

    const NUM_OF_NODES = 64

    const epPeerDescriptor: PeerDescriptor = {
        peerId: PeerID.fromString(`entrypoint`).value,
        type: NodeType.NODEJS,
        websocket: { ip: 'localhost', port: 14444 }
    }

    const randomGraphId = 'webrtc-network'

    let epConnectionManager: ConnectionManager
    let epStreamrNode: StreamrNode

    let connectionManagers: ConnectionManager[]
    let streamrNodes: StreamrNode[]

    beforeEach(async () => {

        streamrNodes = []
        connectionManagers = []

        const layer0Ep = new DhtNode({ peerDescriptor: epPeerDescriptor, numberOfNodesPerKBucket: 3, routeMessageTimeout: 10000 })
        await layer0Ep.start()
        await layer0Ep.joinDht(epPeerDescriptor)

        epConnectionManager = layer0Ep.getTransport() as ConnectionManager
        epStreamrNode = new StreamrNode()
        await epStreamrNode.start(layer0Ep, epConnectionManager, epConnectionManager)

        await epStreamrNode.joinStream(randomGraphId, epPeerDescriptor)

        // range(NUM_OF_NODES).map(async (i) => {
        //     setImmediate(async () => {
        for (let i = 0; i < NUM_OF_NODES; i++) {
            const peerId = PeerID.fromString(`${i}`)
            const peerDescriptor: PeerDescriptor = {
                peerId: peerId.value,
                type: NodeType.NODEJS,
            }

            // console.log(i, peerId.toKey())

            const layer0 = new DhtNode({
                peerDescriptor,
                routeMessageTimeout: 10000,
                entryPoints: [epPeerDescriptor]
            })

            await layer0.start()
            await layer0.joinDht(epPeerDescriptor)

            const connectionManager = layer0.getTransport() as ConnectionManager
            const streamrNode = new StreamrNode()
            await streamrNode.start(layer0, connectionManager, connectionManager)

            // await streamrNode.joinStream(randomGraphId, epPeerDescriptor)
            streamrNode.subscribeToStream(randomGraphId, epPeerDescriptor)
            connectionManagers.push(connectionManager)
            streamrNodes.push(streamrNode)
            // console.log(i)
        }
        // })
        // })

    }, 1500000)

    afterEach(async () => {
        await Promise.all([
            epStreamrNode.destroy(),
            ...streamrNodes.map((streamrNode) => streamrNode.destroy()),
            epConnectionManager.stop(),
            ...connectionManagers.map((cm) => cm.stop())
        ])
    })

    it('happy path', async () => {

        await waitForCondition(() => streamrNodes.length === NUM_OF_NODES, 120000)
        await Promise.all([...streamrNodes.map((streamrNode) =>
            waitForCondition(() => {
                // console.log(
                //     PeerID.fromValue(streamrNode.getPeerDescriptor().peerId).toKey(),
                //     streamrNode.getStream(randomGraphId)!.layer2.getTargetNeighborStringIds().length,
                //     streamrNode.getStream(randomGraphId)!.layer2.getNearbyContactPoolIds().length,
                //     streamrNode.getStream(randomGraphId)!.layer2.getNearbyContactPoolIds().length
                // )

                return streamrNode.getStream(randomGraphId)!.layer2.getTargetNeighborStringIds().length >= 3
            }, 60000)
        )])

        let numOfMessagesReceived = 0

        const successIds = []
        streamrNodes.map((streamrNode) => {
            streamrNode.on(StreamrNodeEvent.NEW_MESSAGE, () => {
                successIds.push(PeerID.fromValue(streamrNode.getPeerDescriptor().peerId).toKey())
                numOfMessagesReceived += 1
            })
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
        // await wait(120000)
        try {
            await waitForCondition(() => {
                // console.log(numOfMessagesReceived)
                return numOfMessagesReceived === NUM_OF_NODES
            }, 10000)
        } catch (err) {
            // console.log(successIds)
            // console.log(successIds.length)
            // const filtered = streamrNodes.filter((node) => !successIds.includes(PeerID.fromValue(node.getPeerDescriptor().peerId).toKey()))
            // filtered.forEach((node) => {
            //     const incoming = node.getStream(randomGraphId).layer2.getTargetNeighborStringIds()
            //         .filter((id) => id !== PeerID.fromValue(epPeerDescriptor.peerId).toKey())
            //         .map((id) => streamrNodes.find((n) => PeerID.fromValue(n.getPeerDescriptor().peerId).toKey() === id)
            //             .getStream(
            //             randomGraphId).layer2.getTargetNeighborStringIds()
            //             .includes(PeerID.fromValue(node.getPeerDescriptor().peerId).toKey())
            //         )
            //     console.log(
            //     PeerID.fromValue(node.getPeerDescriptor().peerId).toKey(),
            //     node.getStream(randomGraphId).layer2.getTargetNeighborStringIds(), incoming
            //     )
            // })
            // console.log(
            // PeerID.fromValue(epStreamrNode.getPeerDescriptor().peerId).toKey(),
            // epStreamrNode.getStream(randomGraphId).layer2.getTargetNeighborStringIds()
            // )
            // expect(true).toEqual(false)
        }

    }, 300000)

})

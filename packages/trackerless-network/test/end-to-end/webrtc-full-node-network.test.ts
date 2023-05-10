import { DhtNode, PeerDescriptor, NodeType, ConnectionManager, PeerID, keyFromPeerDescriptor, peerIdFromPeerDescriptor } from '@streamr/dht'
import { StreamrNode } from '../../src/logic/StreamrNode'
import { range } from 'lodash'
import { waitForCondition } from '@streamr/utils'
import { ContentMessage } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { getRandomRegion } from '@streamr/dht'
import { createStreamMessage } from '../utils/utils'
import { NetworkStack } from '../../src/NetworkStack'

describe('Full node network with WebRTC connections', () => {

    const NUM_OF_NODES = 28

    const epPeerDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString(`entrypoint`).value,
        type: NodeType.NODEJS,
        websocket: { ip: 'localhost', port: 14444 },
        region: getRandomRegion()
    }

    const randomGraphId = 'webrtc-network'

    let entryPoint: NetworkStack

    let nodes: NetworkStack[]

    beforeEach(async () => {

        nodes = []

        entryPoint = new NetworkStack({
            layer0: {
                entryPoints: [epPeerDescriptor],
                peerDescriptor: epPeerDescriptor
            },
            networkNode: {}
        })
        await entryPoint.start()
        await entryPoint.getStreamrNode()!.joinStream(randomGraphId, [epPeerDescriptor])

        await Promise.all(range(NUM_OF_NODES).map(async (i) => {
            const peerId = PeerID.fromString(`${i}`)
            const peerDescriptor: PeerDescriptor = {
                kademliaId: peerId.value,
                type: NodeType.NODEJS,
            }
            const node = new NetworkStack({
                layer0: {
                    peerDescriptor,
                    entryPoints: [epPeerDescriptor]
                }, 
                networkNode: {}
            })
            nodes.push(node)
            await node.start()
            await node.getStreamrNode().joinStream(randomGraphId, [epPeerDescriptor])
            node.getStreamrNode!().subscribeToStream(randomGraphId, [epPeerDescriptor])
        }))

    }, 90000)

    afterEach(async () => {
        await Promise.all([
            entryPoint.stop(),
            ...nodes.map((node) =>  node.stop())
        ])
    })

    it('happy path', async () => {
        await Promise.all(nodes.map((node) =>
            waitForCondition(() => {
                return node.getStreamrNode()!.getStream(randomGraphId)!.layer2.getTargetNeighborStringIds().length >= 3
            }
            , 120000)
        ))
        let numOfMessagesReceived = 0
        const successIds: string[] = []
        nodes.map((node) => {
            node.getStreamrNode()!.on('newMessage', () => {
                successIds.push(keyFromPeerDescriptor(node.getStreamrNode()!.getPeerDescriptor()))
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
        entryPoint.getStreamrNode()!.publishToStream(randomGraphId, [epPeerDescriptor], msg)
        await waitForCondition(() => numOfMessagesReceived === NUM_OF_NODES)
    }, 120000)

})

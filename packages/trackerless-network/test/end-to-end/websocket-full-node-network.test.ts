import { DhtNode, PeerDescriptor, NodeType, PeerID, peerIdFromPeerDescriptor, keyFromPeerDescriptor } from '@streamr/dht'
import { range } from 'lodash'
import { waitForCondition } from '@streamr/utils'
import { ContentMessage } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { createStreamMessage } from '../utils/utils'
import { NetworkStack } from '../../src/NetworkStack'

describe('Full node network with WebSocket connections only', () => {

    const NUM_OF_NODES = 48
    const epPeerDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString(`entrypoint`).value,
        type: NodeType.NODEJS,
        nodeName: 'entrypoint',
        websocket: { ip: 'localhost', port: 15555 }
    }
    const randomGraphId = 'websocket-network'

    let entryPoint: NetworkStack

    let nodes: NetworkStack[]

    beforeEach(async () => {

        nodes = []

        entryPoint = new NetworkStack({
            layer0: {
                entryPoints: [epPeerDescriptor],
                peerDescriptor: epPeerDescriptor,
            },
            networkNode: {}
        })
        await entryPoint.start()
        await entryPoint.getStreamrNode()!.joinStream(randomGraphId, [epPeerDescriptor])

        await Promise.all(range(NUM_OF_NODES).map(async (i) => {
            const node = new NetworkStack({
                layer0: {
                    entryPoints: [epPeerDescriptor],
                    webSocketPort: 15556 + i,
                    webSocketHost: 'localhost',
                    peerIdString: `${i}`,
                    nodeName: `${i}`,
                    numberOfNodesPerKBucket: 4
                }, 
                networkNode: {}
            })
            nodes.push(node)
            await node.start()
            await node.getStreamrNode().joinStream(randomGraphId, [epPeerDescriptor])
            node.getStreamrNode!().subscribeToStream(randomGraphId, [epPeerDescriptor])
        }))

    }, 120000)

    afterEach(async () => {
        await Promise.all([
            entryPoint.stop(),
            ...nodes.map((node) =>  node.stop())
        ])
    })

    it('happy path', async () => {

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
    }, 220000)

})

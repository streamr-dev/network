import { PeerDescriptor, NodeType, PeerID, peerIdFromPeerDescriptor, keyFromPeerDescriptor } from '@streamr/dht'
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
        entryPoint.getStreamrNode()!.setStreamPartEntryPoints(randomGraphId, [epPeerDescriptor])
        await entryPoint.getStreamrNode()!.joinStream(randomGraphId)

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
            node.getStreamrNode!().setStreamPartEntryPoints(randomGraphId, [epPeerDescriptor])
            await node.getStreamrNode().joinStream(randomGraphId)
            node.getStreamrNode!().subscribeToStream(randomGraphId)
        }))

    }, 120000)

    afterEach(async () => {
        await Promise.all([
            entryPoint.stop(),
            ...nodes.map((node) => node.stop())
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
        entryPoint.getStreamrNode()!.publishToStream(randomGraphId, msg)
        await waitForCondition(() => numOfMessagesReceived === NUM_OF_NODES)
    }, 220000)

})

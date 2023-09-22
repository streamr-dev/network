import { PeerDescriptor, NodeType } from '@streamr/dht'
import { range } from 'lodash'
import { hexToBinary, waitForCondition } from '@streamr/utils'
import { createRandomNodeId, createStreamMessage } from '../utils/utils'
import { NetworkStack } from '../../src/NetworkStack'
import { StreamPartIDUtils } from '@streamr/protocol'
import { getNodeIdFromPeerDescriptor } from '../../src/identifiers'
import { randomEthereumAddress } from '@streamr/test-utils'

describe('Full node network with WebSocket connections only', () => {

    const NUM_OF_NODES = 48
    const epPeerDescriptor: PeerDescriptor = {
        kademliaId: hexToBinary(createRandomNodeId()),
        type: NodeType.NODEJS,
        nodeName: 'entrypoint',
        websocket: { host: '127.0.0.1', port: 15555, tls: false }
    }
    const randomGraphId = StreamPartIDUtils.parse('websocket-network#0')

    let entryPoint: NetworkStack

    let nodes: NetworkStack[]

    beforeEach(async () => {

        nodes = []

        entryPoint = new NetworkStack({
            layer0: {
                entryPoints: [epPeerDescriptor],
                peerDescriptor: epPeerDescriptor,
            }
        })
        await entryPoint.start()
        entryPoint.getStreamrNode()!.setStreamPartEntryPoints(randomGraphId, [epPeerDescriptor])
        await entryPoint.getStreamrNode()!.joinStream(randomGraphId)

        await Promise.all(range(NUM_OF_NODES).map(async (i) => {
            const node = new NetworkStack({
                layer0: {
                    entryPoints: [epPeerDescriptor],
                    websocketPortRange: { min: 15556 + i, max: 15556 + i },
                    peerIdString: `${i}`,
                    nodeName: `${i}`,
                    numberOfNodesPerKBucket: 4
                }
            })
            nodes.push(node)
            await node.start()
            node.getStreamrNode().setStreamPartEntryPoints(randomGraphId, [epPeerDescriptor])
            await node.getStreamrNode().joinStream(randomGraphId)
            node.getStreamrNode().subscribeToStream(randomGraphId)
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
                return node.getStreamrNode()!.getStream(randomGraphId)!.layer2.getTargetNeighborIds().length >= 3
            }
            , 120000)
        ))
        let numOfMessagesReceived = 0
        const successIds: string[] = []
        nodes.map((node) => {
            node.getStreamrNode()!.on('newMessage', () => {
                successIds.push(getNodeIdFromPeerDescriptor(node.getStreamrNode()!.getPeerDescriptor()))
                numOfMessagesReceived += 1
            })
        })

        const msg = createStreamMessage(
            JSON.stringify({ hello: 'WORLD' }),
            randomGraphId,
            randomEthereumAddress()
        )
        entryPoint.getStreamrNode()!.publishToStream(randomGraphId, msg)
        await waitForCondition(() => numOfMessagesReceived === NUM_OF_NODES)
    }, 220000)

})

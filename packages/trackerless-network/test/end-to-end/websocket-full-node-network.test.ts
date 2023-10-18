import { StreamPartIDUtils } from '@streamr/protocol'
import { randomEthereumAddress } from '@streamr/test-utils'
import { waitForCondition } from '@streamr/utils'
import { range } from 'lodash'
import { NetworkStack } from '../../src/NetworkStack'
import { getNodeIdFromPeerDescriptor } from '../../src/identifiers'
import { createMockPeerDescriptor, createStreamMessage } from '../utils/utils'

describe('Full node network with WebSocket connections only', () => {

    const NUM_OF_NODES = 48
    const epPeerDescriptor = createMockPeerDescriptor({
        websocket: { host: '127.0.0.1', port: 15555, tls: false }
    })
    const streamPartId = StreamPartIDUtils.parse('websocket-network#0')

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
        entryPoint.getStreamrNode()!.setStreamPartEntryPoints(streamPartId, [epPeerDescriptor])
        entryPoint.getStreamrNode()!.joinStreamPart(streamPartId)

        await Promise.all(range(NUM_OF_NODES).map(async (i) => {
            const node = new NetworkStack({
                layer0: {
                    entryPoints: [epPeerDescriptor],
                    websocketPortRange: { min: 15556 + i, max: 15556 + i },
                    numberOfNodesPerKBucket: 4
                }
            })
            nodes.push(node)
            await node.start()
            node.getStreamrNode().setStreamPartEntryPoints(streamPartId, [epPeerDescriptor])
            node.getStreamrNode().joinStreamPart(streamPartId)
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
                return node.getStreamrNode()!.getNeighbors(streamPartId).length >= 4
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
            streamPartId,
            randomEthereumAddress()
        )
        entryPoint.getStreamrNode()!.broadcast(msg)
        await waitForCondition(() => numOfMessagesReceived === NUM_OF_NODES)
    }, 220000)

})

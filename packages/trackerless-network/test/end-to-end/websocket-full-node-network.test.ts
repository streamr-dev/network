import { toNodeId } from '@streamr/dht'
import { StreamPartIDUtils, until } from '@streamr/utils'
import { range } from 'lodash'
import { NetworkStack } from '../../src/NetworkStack'
import { createMockPeerDescriptor, createStreamMessage } from '../utils/utils'
import { randomUserId } from '@streamr/test-utils'

describe('Full node network with WebSocket connections only', () => {
    const NUM_OF_NODES = 12
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
                websocketServerEnableTls: false
            }
        })
        await entryPoint.start()
        entryPoint.getContentDeliveryManager().joinStreamPart(streamPartId)

        await Promise.all(
            range(NUM_OF_NODES).map(async (i) => {
                const node = new NetworkStack({
                    layer0: {
                        entryPoints: [epPeerDescriptor],
                        websocketPortRange: { min: 15556 + i, max: 15556 + i },
                        numberOfNodesPerKBucket: 4,
                        websocketServerEnableTls: false
                    }
                })
                nodes.push(node)
                await node.start()
                node.getContentDeliveryManager().joinStreamPart(streamPartId)
            })
        )
    }, 120000)

    afterEach(async () => {
        await Promise.all([entryPoint.stop(), ...nodes.map((node) => node.stop())])
    })

    it('happy path', async () => {
        await Promise.all(
            nodes.map((node) =>
                until(() => {
                    return node.getContentDeliveryManager().getNeighbors(streamPartId).length >= 4
                }, 30000)
            )
        )
        let receivedMessageCount = 0
        const successIds: string[] = []
        nodes.forEach((node) => {
            node.getContentDeliveryManager().on('newMessage', () => {
                successIds.push(toNodeId(node.getContentDeliveryManager().getPeerDescriptor()))
                receivedMessageCount += 1
            })
        })

        const msg = createStreamMessage(JSON.stringify({ hello: 'WORLD' }), streamPartId, randomUserId())
        entryPoint.getContentDeliveryManager().broadcast(msg)
        await until(() => receivedMessageCount === NUM_OF_NODES)
    }, 220000)
})

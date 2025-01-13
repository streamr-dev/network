import { toNodeId, getRandomRegion } from '@streamr/dht'
import { StreamPartIDUtils, until } from '@streamr/utils'
import { range } from 'lodash'
import { NetworkStack } from '../../src/NetworkStack'
import { createMockPeerDescriptor, createStreamMessage } from '../utils/utils'
import { randomUserId } from '@streamr/test-utils'

describe('Full node network with WebRTC connections', () => {
    const NUM_OF_NODES = 22

    const epPeerDescriptor = createMockPeerDescriptor({
        websocket: { host: '127.0.0.1', port: 14444, tls: false },
        region: getRandomRegion()
    })

    const streamPartId = StreamPartIDUtils.parse('webrtc-network#0')

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
            range(NUM_OF_NODES).map(async () => {
                const peerDescriptor = createMockPeerDescriptor()
                const node = new NetworkStack({
                    layer0: {
                        peerDescriptor,
                        entryPoints: [epPeerDescriptor]
                    }
                })
                nodes.push(node)
                await node.start()
                node.getContentDeliveryManager().joinStreamPart(streamPartId)
            })
        )
    }, 90000)

    afterEach(async () => {
        await Promise.all([entryPoint.stop(), ...nodes.map((node) => node.stop())])
    })

    it('happy path', async () => {
        await Promise.all(
            nodes.map((node) =>
                until(() => {
                    return node.getContentDeliveryManager().getNeighbors(streamPartId).length >= 3
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
    }, 120000)
})

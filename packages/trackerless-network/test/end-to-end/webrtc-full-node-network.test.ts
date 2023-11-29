import { getRandomRegion } from '@streamr/dht'
import { StreamPartIDUtils } from '@streamr/protocol'
import { randomEthereumAddress } from '@streamr/test-utils'
import { waitForCondition } from '@streamr/utils'
import { range } from 'lodash'
import { NetworkStack } from '../../src/NetworkStack'
import { getNodeIdFromPeerDescriptor } from '../../src/identifiers'
import { createMockPeerDescriptor, createStreamMessage } from '../utils/utils'

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
        entryPoint.getDeliveryLayer()!.setStreamPartEntryPoints(streamPartId, [epPeerDescriptor])
        entryPoint.getDeliveryLayer()!.joinStreamPart(streamPartId)

        await Promise.all(range(NUM_OF_NODES).map(async () => {
            const peerDescriptor = createMockPeerDescriptor()
            const node = new NetworkStack({
                layer0: {
                    peerDescriptor,
                    entryPoints: [epPeerDescriptor]
                }
            })
            nodes.push(node)
            await node.start()
            node.getDeliveryLayer().setStreamPartEntryPoints(streamPartId, [epPeerDescriptor])
            node.getDeliveryLayer().joinStreamPart(streamPartId)
        }))

    }, 90000)

    afterEach(async () => {
        await Promise.all([
            entryPoint.stop(),
            ...nodes.map((node) => node.stop())
        ])
    })

    it('happy path', async () => {
        await Promise.all(nodes.map((node) =>
            waitForCondition(() => {
                return node.getDeliveryLayer()!.getNeighbors(streamPartId).length >= 3
            }
            , 120000)
        ))
        let numOfMessagesReceived = 0
        const successIds: string[] = []
        nodes.forEach((node) => {
            node.getDeliveryLayer()!.on('newMessage', () => {
                successIds.push(getNodeIdFromPeerDescriptor(node.getDeliveryLayer()!.getPeerDescriptor()))
                numOfMessagesReceived += 1
            })
        })
        const msg = createStreamMessage(
            JSON.stringify({ hello: 'WORLD' }),
            streamPartId,
            randomEthereumAddress()
        )
        entryPoint.getDeliveryLayer()!.broadcast(msg)
        await waitForCondition(() => numOfMessagesReceived === NUM_OF_NODES)
    }, 120000)

})

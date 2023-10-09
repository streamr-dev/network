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

    const randomGraphId = StreamPartIDUtils.parse('webrtc-network#0')

    let entryPoint: NetworkStack

    let nodes: NetworkStack[]

    beforeEach(async () => {

        nodes = []

        entryPoint = new NetworkStack({
            layer0: {
                entryPoints: [epPeerDescriptor],
                peerDescriptor: epPeerDescriptor
            }
        })
        await entryPoint.start()
        entryPoint.getStreamrNode()!.setStreamPartEntryPoints(randomGraphId, [epPeerDescriptor])
        entryPoint.getStreamrNode()!.joinStreamPart(randomGraphId)

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
            node.getStreamrNode().setStreamPartEntryPoints(randomGraphId, [epPeerDescriptor])
            node.getStreamrNode().joinStreamPart(randomGraphId)
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
                return node.getStreamrNode()!.getNeighbors(randomGraphId).length >= 3
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
        entryPoint.getStreamrNode()!.broadcast(msg)
        await waitForCondition(() => numOfMessagesReceived === NUM_OF_NODES)
    }, 120000)

})

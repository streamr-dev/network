import { PeerDescriptor } from '../../generated/packages/dht/protos/DhtRpc'
import { DhtNode } from '../../src/dht/DhtNode'
import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { until } from '@streamr/utils'
import { createMockPeerDescriptor } from '../utils/utils'
import { areEqualPeerDescriptors } from '../../src/identifiers'

describe('Websocket IConnection Requests', () => {
    const epPeerDescriptor = createMockPeerDescriptor({
        websocket: { host: '127.0.0.1', port: 10021, tls: false }
    })
    let epDhtNode: DhtNode
    let node1: DhtNode
    let node2: DhtNode

    beforeEach(async () => {
        epDhtNode = new DhtNode({ peerDescriptor: epPeerDescriptor, websocketServerEnableTls: false })
        await epDhtNode.start()

        await epDhtNode.joinDht([epPeerDescriptor])

        node1 = new DhtNode({
            websocketPortRange: { min: 10022, max: 10022 },
            entryPoints: [epPeerDescriptor],
            websocketServerEnableTls: false
        })
        node2 = new DhtNode({
            entryPoints: [epPeerDescriptor],
            websocketServerEnableTls: false
        })

        await node1.start()
        await node2.start()
    })

    afterEach(async () => {
        await epDhtNode.stop()
        await node1.stop()
        await node2.stop()
    })

    it('Happy Path', async () => {
        let connected1 = false
        let connected2 = false

        node1.on('connected', (peerDescriptor: PeerDescriptor) => {
            if (areEqualPeerDescriptors(peerDescriptor, node2.getLocalPeerDescriptor())) {
                connected1 = true
            }
        })
        node2.on('connected', (peerDescriptor: PeerDescriptor) => {
            if (areEqualPeerDescriptors(peerDescriptor, node1.getLocalPeerDescriptor())) {
                connected2 = true
            }
        })

        await node2.joinDht([epPeerDescriptor])
        await node1.joinDht([epPeerDescriptor])

        await until(() => {
            return connected1 && connected2
        })

        expect((node1.getTransport() as ConnectionManager).hasConnection(node2.getNodeId())).toEqual(true)
        expect((node2.getTransport() as ConnectionManager).hasConnection(node1.getNodeId())).toEqual(true)
    }, 10000)
})

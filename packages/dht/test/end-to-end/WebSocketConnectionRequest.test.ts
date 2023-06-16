import { NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { DhtNode } from '../../src/dht/DhtNode'
import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { PeerID } from '../../src/helpers/PeerID'
import { waitForCondition } from '@streamr/utils'
import { isSamePeerDescriptor } from '../../src/helpers/peerIdFromPeerDescriptor'

describe('WebSocket IConnection Requests', () => {
    const epPeerDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString('3').value, // Uint8Array.from([1, 2, 3]),
        type: NodeType.NODEJS,
        websocket: { ip: '127.0.0.1', port: 10021 }
    }
    let epDhtNode: DhtNode
    let node1: DhtNode
    let node2: DhtNode

    beforeEach(async () => {

        epDhtNode = new DhtNode({ peerDescriptor: epPeerDescriptor })
        await epDhtNode.start()

        await epDhtNode.joinDht(epPeerDescriptor)

        node1 = new DhtNode({ peerIdString: '2', nodeName: 'node1', webSocketPort: 10022, entryPoints: [epPeerDescriptor] })
        node2 = new DhtNode({ peerIdString: '1', nodeName: 'node2', entryPoints: [epPeerDescriptor] })
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
            if (isSamePeerDescriptor(peerDescriptor, node2.getPeerDescriptor())) {
                connected1 = true
            }
        })
        node2.on('connected', (peerDescriptor: PeerDescriptor) => {
            if (isSamePeerDescriptor(peerDescriptor, node1.getPeerDescriptor())) {
                connected2 = true
            }
        })

        await node2.joinDht(epPeerDescriptor)
        await node1.joinDht(epPeerDescriptor)

        await waitForCondition(() => { return (connected1 && connected2) })

        expect((node1.getTransport() as ConnectionManager).hasConnection(node2.getPeerDescriptor())).toEqual(true)
        expect((node2.getTransport() as ConnectionManager).hasConnection(node1.getPeerDescriptor())).toEqual(true)

    }, 10000)
})

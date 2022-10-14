import { NodeType, PeerDescriptor } from '../../src/proto/DhtRpc'
import { DhtNode } from '../../src/dht/DhtNode'
import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { PeerID } from '../../src/helpers/PeerID'
import { waitForCondition } from 'streamr-test-utils'

describe('WebSocket IConnection Requests', () => {
    const epPeerDescriptor: PeerDescriptor = {
        peerId: PeerID.fromString('3').value, // Uint8Array.from([1, 2, 3]),
        type: NodeType.NODEJS,
        websocket: { ip: 'localhost', port: 10021 }
    }
    let epDhtNode: DhtNode
    let node1: DhtNode
    let node2: DhtNode

    beforeEach(async () => {

        epDhtNode = new DhtNode({ peerDescriptor: epPeerDescriptor })
        await epDhtNode.start()

        await epDhtNode.joinDht(epPeerDescriptor)

        node1 = new DhtNode({ peerIdString: '2', webSocketPort: 10022, entryPoints: [epPeerDescriptor] })
        node2 = new DhtNode({ peerIdString: '1', entryPoints: [epPeerDescriptor] })
        await node1.start()
        await node2.start()

        await epDhtNode.joinDht(epPeerDescriptor)
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
            if (PeerID.fromValue(node2.getPeerDescriptor().peerId)
                .equals(PeerID.fromValue(peerDescriptor.peerId))) {
                connected1 = true
            }
        })
        node2.on('connected', (peerDescriptor: PeerDescriptor) => {
            if (PeerID.fromValue(node1.getPeerDescriptor().peerId)
                .equals(PeerID.fromValue(peerDescriptor.peerId))) {
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

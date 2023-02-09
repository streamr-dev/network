import { PeerList } from '../../src/logic/PeerList'
import { RemoteRandomGraphNode } from '../../src/logic/RemoteRandomGraphNode'
import {
    PeerDescriptor,
    ListeningRpcCommunicator,
    Simulator,
    PeerID,
    SimulatorTransport,
    keyFromPeerDescriptor
} from '@streamr/dht'
import { NetworkRpcClient } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc.client'
import { toProtoRpcClient } from '@streamr/proto-rpc'

describe('PeerList', () => {

    const ids = [
        new Uint8Array([1, 1, 1]),
        new Uint8Array([1, 1, 2]),
        new Uint8Array([1, 1, 3]),
        new Uint8Array([1, 1, 4]),
        new Uint8Array([1, 1, 5])
    ]
    const ownId = PeerID.fromString('test')
    const graphId = 'test'
    let peerList: PeerList
    const simulator = new Simulator()

    const createRemoteGraphNode = (peerDescriptor: PeerDescriptor) => {
        const mockTransport = new SimulatorTransport(peerDescriptor, simulator)
        const mockCommunicator = new ListeningRpcCommunicator(`layer2-${ graphId }`, mockTransport)
        const mockClient = mockCommunicator.getRpcClientTransport()
        
        return new RemoteRandomGraphNode(peerDescriptor, graphId, toProtoRpcClient(new NetworkRpcClient(mockClient)))
    }

    beforeEach(() => {
        peerList = new PeerList(ownId, 6)

        ids.forEach((peerId) => {
            const peerDescriptor: PeerDescriptor = {
                kademliaId: peerId,
                type: 0
            }
            peerList.add(createRemoteGraphNode(peerDescriptor))
        })

    })

    it('add', () => {
        const newDescriptor = {
            kademliaId: new Uint8Array([1, 2, 3]),
            type: 0
        }
        const newNode = createRemoteGraphNode(newDescriptor)
        peerList.add(newNode)
        expect(peerList.hasPeer(newDescriptor)).toEqual(true)

        const newDescriptor2 = {
            kademliaId: new Uint8Array([1, 2, 4]),
            type: 0
        }
        const newNode2 = createRemoteGraphNode(newDescriptor2)
        peerList.add(newNode2)
        expect(peerList.hasPeer(newDescriptor2)).toEqual(false)
    })

    it('remove', () => {
        const toRemove = peerList.getClosest([])
        peerList.remove(toRemove!.getPeerDescriptor())
        expect(peerList.hasPeer(toRemove!.getPeerDescriptor())).toEqual(false)
    })

    it('removeById', () => {
        const toRemove = peerList.getClosest([])
        const stringId = keyFromPeerDescriptor(toRemove!.getPeerDescriptor())
        peerList.removeById(stringId)
        expect(peerList.hasPeer(toRemove!.getPeerDescriptor())).toEqual(false)
    })
})

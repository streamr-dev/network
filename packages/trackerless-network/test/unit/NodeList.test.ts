import { NodeList } from '../../src/logic/NodeList'
import { RemoteRandomGraphNode } from '../../src/logic/RemoteRandomGraphNode'
import {
    PeerDescriptor,
    ListeningRpcCommunicator,
    Simulator,
    PeerID,
    SimulatorTransport,
} from '@streamr/dht'
import { NetworkRpcClient } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc.client'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { expect } from 'expect'
import { NodeID, getNodeIdFromPeerDescriptor } from '../../src/identifiers'

describe('NodeList', () => {

    const ids = [
        new Uint8Array([1, 1, 1]),
        new Uint8Array([1, 1, 2]),
        new Uint8Array([1, 1, 3]),
        new Uint8Array([1, 1, 4]),
        new Uint8Array([1, 1, 5])
    ]
    const ownId = PeerID.fromString('test')
    const graphId = 'test'
    let nodeList: NodeList
    let simulator: Simulator
    let mockTransports: SimulatorTransport[]

    const createRemoteGraphNode = (peerDescriptor: PeerDescriptor) => {
        const mockTransport = new SimulatorTransport(peerDescriptor, simulator)
        const mockCommunicator = new ListeningRpcCommunicator(`layer2-${ graphId }`, mockTransport)
        const mockClient = mockCommunicator.getRpcClientTransport()
        
        mockTransports.push(mockTransport)
        return new RemoteRandomGraphNode(peerDescriptor, graphId, toProtoRpcClient(new NetworkRpcClient(mockClient)))
    }

    beforeEach(() => {
        simulator = new Simulator()
        mockTransports = []
        nodeList = new NodeList(ownId, 6)
        ids.forEach((peerId) => {
            const peerDescriptor: PeerDescriptor = {
                kademliaId: peerId,
                type: 0
            }
            nodeList.add(createRemoteGraphNode(peerDescriptor))
        })
    })

    afterEach(async ()=> {
        // eslint-disable-next-line @typescript-eslint/prefer-for-of
        for (let i = 0; i < mockTransports.length; i++) {
            await mockTransports[i].stop()
        }
        simulator.stop()
    })

    it('add', () => {
        const newDescriptor = {
            kademliaId: new Uint8Array([1, 2, 3]),
            type: 0
        }
        const newNode = createRemoteGraphNode(newDescriptor)
        nodeList.add(newNode)
        expect(nodeList.hasNode(newDescriptor)).toEqual(true)

        const newDescriptor2 = {
            kademliaId: new Uint8Array([1, 2, 4]),
            type: 0
        }
        const newNode2 = createRemoteGraphNode(newDescriptor2)
        nodeList.add(newNode2)
        expect(nodeList.hasNode(newDescriptor2)).toEqual(false)
    })

    it('remove', () => {
        const toRemove = nodeList.getClosest([])
        nodeList.remove(toRemove!.getPeerDescriptor())
        expect(nodeList.hasNode(toRemove!.getPeerDescriptor())).toEqual(false)
    })

    it('removeById', () => {
        const toRemove = nodeList.getClosest([])
        const nodeId = getNodeIdFromPeerDescriptor(toRemove!.getPeerDescriptor())
        nodeList.removeById(nodeId)
        expect(nodeList.hasNode(toRemove!.getPeerDescriptor())).toEqual(false)
    })

    it('getClosest', () => {
        const closest = nodeList.getClosest([])
        expect(getNodeIdFromPeerDescriptor(closest!.getPeerDescriptor()))
            .toEqual(PeerID.fromValue(new Uint8Array([1, 1, 1])).toKey())
    })

    it('getClosest with exclude', () => {
        const closest = nodeList.getClosest([PeerID.fromValue(new Uint8Array([1, 1, 1])).toKey() as unknown as NodeID])
        expect(getNodeIdFromPeerDescriptor(closest!.getPeerDescriptor()))
            .toEqual(PeerID.fromValue(new Uint8Array([1, 1, 2])).toKey())
    })

    it('getFurthest', () => {
        const closest = nodeList.getFurthest([])
        expect(getNodeIdFromPeerDescriptor(closest!.getPeerDescriptor()))
            .toEqual(PeerID.fromValue(new Uint8Array([1, 1, 5])).toKey())
    })

    it('getFurthest with exclude', () => {
        const closest = nodeList.getFurthest([PeerID.fromValue(new Uint8Array([1, 1, 5])).toKey() as unknown as NodeID])
        expect(getNodeIdFromPeerDescriptor(closest!.getPeerDescriptor()))
            .toEqual(PeerID.fromValue(new Uint8Array([1, 1, 4])).toKey())
    })

    it('getClosestAndFurthest', () => {
        const results = nodeList.getClosestAndFurthest([])
        expect(results).toEqual([nodeList.getClosest([]), nodeList.getFurthest([])])
    })

    it('getClosest empty', () => {
        const emptyList = new NodeList(ownId, 2)
        expect(emptyList.getClosest([])).toBeUndefined()
    })

    it('getFurthest empty', () => {
        const emptyList = new NodeList(ownId, 2)
        expect(emptyList.getFurthest([])).toBeUndefined()
    })

    it('getRandom empty', () => {
        const emptyList = new NodeList(ownId, 2)
        expect(emptyList.getRandom([])).toBeUndefined()
    })

    it('getClosestAndFurthest empty', () => {
        const emptyList = new NodeList(ownId, 2)
        expect(emptyList.getClosestAndFurthest([])).toEqual([])
    })

    it('getClosestAndFurthest with exclude', () => {
        const results = nodeList.getClosestAndFurthest([
            PeerID.fromValue(new Uint8Array([1, 1, 1])).toKey() as unknown as NodeID,
            PeerID.fromValue(new Uint8Array([1, 1, 5])).toKey() as unknown as NodeID
        ])
        expect(results).toEqual([
            nodeList.getClosest([PeerID.fromValue(new Uint8Array([1, 1, 1])).toKey() as unknown as NodeID]),
            nodeList.getFurthest([PeerID.fromValue(new Uint8Array([1, 1, 5])).toKey() as unknown as NodeID])
        ])
    })
})

import { NodeList } from '../../src/logic/NodeList'
import { RemoteRandomGraphNode } from '../../src/logic/RemoteRandomGraphNode'
import {
    PeerDescriptor,
    ListeningRpcCommunicator,
    Simulator,
    SimulatorTransport,
    NodeType,
} from '@streamr/dht'
import { NetworkRpcClient } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc.client'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { expect } from 'expect'
import { NodeID, getNodeIdFromPeerDescriptor } from '../../src/identifiers'
import { createMockPeerDescriptor, createRandomNodeId } from '../utils/utils'
import { binaryToHex } from '@streamr/utils'

describe('NodeList', () => {

    const ids = [
        new Uint8Array([1, 1, 1]),
        new Uint8Array([1, 1, 2]),
        new Uint8Array([1, 1, 3]),
        new Uint8Array([1, 1, 4]),
        new Uint8Array([1, 1, 5])
    ]
    const ownId = createRandomNodeId()
    const graphId = 'test'
    let nodeList: NodeList
    let simulator: Simulator
    let mockTransports: SimulatorTransport[]

    const createRemoteGraphNode = async (peerDescriptor: PeerDescriptor) => {
        const mockTransport = new SimulatorTransport(peerDescriptor, simulator)
        await mockTransport.start()
        const mockCommunicator = new ListeningRpcCommunicator(`layer2-${ graphId }`, mockTransport)
        const mockClient = mockCommunicator.getRpcClientTransport()
        
        mockTransports.push(mockTransport)
        return new RemoteRandomGraphNode(createMockPeerDescriptor(), peerDescriptor, graphId, toProtoRpcClient(new NetworkRpcClient(mockClient)))
    }

    beforeEach(async () => {
        simulator = new Simulator()
        mockTransports = []
        nodeList = new NodeList(ownId, 6)
        for (const id of ids) {
            const peerDescriptor: PeerDescriptor = {
                kademliaId: id,
                type: NodeType.NODEJS
            }
            nodeList.add(await createRemoteGraphNode(peerDescriptor))
        }
    })

    afterEach(async ()=> {
        // eslint-disable-next-line @typescript-eslint/prefer-for-of
        for (let i = 0; i < mockTransports.length; i++) {
            await mockTransports[i].stop()
        }
        simulator.stop()
    })

    it('add', async () => {
        const newDescriptor = {
            kademliaId: new Uint8Array([1, 2, 3]),
            type: NodeType.NODEJS
        }
        const newNode = await createRemoteGraphNode(newDescriptor)
        nodeList.add(newNode)
        expect(nodeList.hasNode(newDescriptor)).toEqual(true)

        const newDescriptor2 = {
            kademliaId: new Uint8Array([1, 2, 4]),
            type: NodeType.NODEJS
        }
        const newNode2 = await createRemoteGraphNode(newDescriptor2)
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
            .toEqual(binaryToHex(new Uint8Array([1, 1, 1])))
    })

    it('getClosest with exclude', () => {
        const closest = nodeList.getClosest([binaryToHex(new Uint8Array([1, 1, 1])) as unknown as NodeID])
        expect(getNodeIdFromPeerDescriptor(closest!.getPeerDescriptor()))
            .toEqual(binaryToHex(new Uint8Array([1, 1, 2])))
    })

    it('getFurthest', () => {
        const closest = nodeList.getFurthest([])
        expect(getNodeIdFromPeerDescriptor(closest!.getPeerDescriptor()))
            .toEqual(binaryToHex(new Uint8Array([1, 1, 5])))
    })

    it('getFurthest with exclude', () => {
        const closest = nodeList.getFurthest([binaryToHex(new Uint8Array([1, 1, 5])) as unknown as NodeID])
        expect(getNodeIdFromPeerDescriptor(closest!.getPeerDescriptor()))
            .toEqual(binaryToHex(new Uint8Array([1, 1, 4])))
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
            binaryToHex(new Uint8Array([1, 1, 1])) as unknown as NodeID,
            binaryToHex(new Uint8Array([1, 1, 5])) as unknown as NodeID
        ])
        expect(results).toEqual([
            nodeList.getClosest([binaryToHex(new Uint8Array([1, 1, 1])) as unknown as NodeID]),
            nodeList.getFurthest([binaryToHex(new Uint8Array([1, 1, 5])) as unknown as NodeID])
        ])
    })
})

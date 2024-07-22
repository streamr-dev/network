import {
    ListeningRpcCommunicator,
    NodeType,
    PeerDescriptor,
    createRandomDhtAddress,
    getDhtAddressFromRaw,
    getNodeIdFromPeerDescriptor,
} from '@streamr/dht'
import { StreamPartIDUtils } from '@streamr/utils'
import { expect } from 'expect'
import { ContentDeliveryRpcRemote } from '../../src/logic/ContentDeliveryRpcRemote'
import { NodeList } from '../../src/logic/NodeList'
import { formStreamPartContentDeliveryServiceId } from '../../src/logic/formStreamPartDeliveryServiceId'
import { ContentDeliveryRpcClient } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc.client'
import { MockTransport } from '../utils/mock/MockTransport'
import { createMockPeerDescriptor } from '../utils/utils'

const streamPartId = StreamPartIDUtils.parse('stream#0')

describe('NodeList', () => {

    const ids = [
        new Uint8Array([1, 1, 1]),
        new Uint8Array([1, 1, 2]),
        new Uint8Array([1, 1, 3]),
        new Uint8Array([1, 1, 4]),
        new Uint8Array([1, 1, 5])
    ]
    const ownId = createRandomDhtAddress()
    let nodeList: NodeList

    const createRemoteGraphNode = (peerDescriptor: PeerDescriptor) => {
        const mockCommunicator = new ListeningRpcCommunicator(formStreamPartContentDeliveryServiceId(streamPartId), new MockTransport())
        return new ContentDeliveryRpcRemote(
            createMockPeerDescriptor(),
            peerDescriptor,
            mockCommunicator,
            ContentDeliveryRpcClient
        )
    }

    beforeEach(() => {
        nodeList = new NodeList(ownId, 6)
        for (const id of ids) {
            const peerDescriptor: PeerDescriptor = {
                nodeId: id,
                type: NodeType.NODEJS
            }
            nodeList.add(createRemoteGraphNode(peerDescriptor))
        }
    })

    it('add', () => {
        const newDescriptor = {
            nodeId: new Uint8Array([1, 2, 3]),
            type: NodeType.NODEJS
        }
        const newNode = createRemoteGraphNode(newDescriptor)
        nodeList.add(newNode)
        expect(nodeList.has(getNodeIdFromPeerDescriptor(newDescriptor))).toEqual(true)

        const newDescriptor2 = {
            nodeId: new Uint8Array([1, 2, 4]),
            type: NodeType.NODEJS
        }
        const newNode2 = createRemoteGraphNode(newDescriptor2)
        nodeList.add(newNode2)
        expect(nodeList.has(getNodeIdFromPeerDescriptor(newDescriptor2))).toEqual(false)
    })

    it('remove', () => {
        const toRemove = nodeList.getFirst([])
        const nodeId = getNodeIdFromPeerDescriptor(toRemove!.getPeerDescriptor())
        nodeList.remove(nodeId)
        expect(nodeList.has(nodeId)).toEqual(false)
    })

    it('getFirst', () => {
        const closest = nodeList.getFirst([])
        expect(getNodeIdFromPeerDescriptor(closest!.getPeerDescriptor()))
            .toEqual(getDhtAddressFromRaw(new Uint8Array([1, 1, 1])))
    })

    it('getFirst with exclude', () => {
        const closest = nodeList.getFirst([getDhtAddressFromRaw(new Uint8Array([1, 1, 1]))])
        expect(getNodeIdFromPeerDescriptor(closest!.getPeerDescriptor()))
            .toEqual(getDhtAddressFromRaw(new Uint8Array([1, 1, 2])))
    })

    it('getLast', () => {
        const closest = nodeList.getLast([])
        expect(getNodeIdFromPeerDescriptor(closest!.getPeerDescriptor()))
            .toEqual(getDhtAddressFromRaw(new Uint8Array([1, 1, 5])))
    })

    it('getLast with exclude', () => {
        const closest = nodeList.getLast([getDhtAddressFromRaw(new Uint8Array([1, 1, 5]))])
        expect(getNodeIdFromPeerDescriptor(closest!.getPeerDescriptor()))
            .toEqual(getDhtAddressFromRaw(new Uint8Array([1, 1, 4])))
    })

    it('getFirstAndLast', () => {
        const results = nodeList.getFirstAndLast([])
        expect(results).toEqual([nodeList.getFirst([]), nodeList.getLast([])])
    })

    it('getFirst empty', () => {
        const emptyList = new NodeList(ownId, 2)
        expect(emptyList.getFirst([])).toBeUndefined()
    })

    it('getLast empty', () => {
        const emptyList = new NodeList(ownId, 2)
        expect(emptyList.getLast([])).toBeUndefined()
    })

    it('getRandom empty', () => {
        const emptyList = new NodeList(ownId, 2)
        expect(emptyList.getRandom([])).toBeUndefined()
    })

    it('getFirstAndLast empty', () => {
        const emptyList = new NodeList(ownId, 2)
        expect(emptyList.getFirstAndLast([])).toEqual([])
    })

    it('getFirstAndLast with exclude', () => {
        const results = nodeList.getFirstAndLast([
            getDhtAddressFromRaw(new Uint8Array([1, 1, 1])),
            getDhtAddressFromRaw(new Uint8Array([1, 1, 5]))
        ])
        expect(results).toEqual([
            nodeList.getFirst([getDhtAddressFromRaw(new Uint8Array([1, 1, 1]))]),
            nodeList.getLast([getDhtAddressFromRaw(new Uint8Array([1, 1, 5]))])
        ])
    })

    it('items are in insertion order', () => {
        const list = new NodeList(createRandomDhtAddress(), 100)
        const item1 = createRemoteGraphNode(createMockPeerDescriptor())
        const item2 = createRemoteGraphNode(createMockPeerDescriptor())
        const item3 = createRemoteGraphNode(createMockPeerDescriptor())
        const item4 = createRemoteGraphNode(createMockPeerDescriptor())
        const item5 = createRemoteGraphNode(createMockPeerDescriptor())
        const item6 = createRemoteGraphNode(createMockPeerDescriptor())
        list.add(item2)
        list.add(item3)
        list.add(item1)
        list.add(item6)
        list.add(item4)
        list.add(item5)
        expect(list.getFirst([])!).toEqual(item2)
        expect(list.getLast([])!).toEqual(item5)
        // the order doesn't change if item re-added
        list.add(item4)
        expect(list.getLast([])!).toEqual(item5)
    })
})

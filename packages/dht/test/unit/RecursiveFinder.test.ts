import {
    FindMode,
    Message,
    MessageType,
    PeerDescriptor,
    RouteMessageWrapper
} from '../../src/proto/packages/dht/protos/DhtRpc'
import { PeerID, PeerIDKey } from '../../src/helpers/PeerID'
import {
    createMockRoutingRpcCommunicator,
    createWrappedClosestPeersRequest,
    createRecursiveFindRequest
} from '../utils/utils'
import { RecursiveFinder } from '../../src/dht/find/RecursiveFinder'
import { DhtPeer } from '../../src/dht/DhtPeer'
import { LocalDataStore } from '../../src/dht/store/LocalDataStore'
import { v4 } from 'uuid'
import { MockRouter } from '../utils/mock/Router'
import { MockTransport } from '../utils/mock/Transport'
import { expect } from 'expect'
import { isSamePeerDescriptor } from '../../src/helpers/peerIdFromPeerDescriptor'

describe('RecursiveFinder', () => {

    let recursiveFinder: RecursiveFinder
    let connections: Map<PeerIDKey, DhtPeer>

    const peerId1 = PeerID.fromString('peerid')
    const peerDescriptor1: PeerDescriptor = {
        kademliaId: peerId1.value,
        type: 0,
        nodeName: 'peerid'
    }
    const peerDescriptor2: PeerDescriptor = {
        kademliaId: PeerID.fromString('destination').value,
        type: 0,
        nodeName: 'destination'
    }
    const recursiveFindRequest = createRecursiveFindRequest(FindMode.NODE)
    const message: Message = {
        serviceId: 'unknown',
        messageId: v4(),
        messageType: MessageType.RPC,
        body: {
            oneofKind: 'recursiveFindRequest',
            recursiveFindRequest
        },
        sourceDescriptor: peerDescriptor1,
        targetDescriptor: peerDescriptor2
    }
    const routedMessage: RouteMessageWrapper = {
        message,
        requestId: 'REQ',
        routingPath: [],
        reachableThrough: [],
        destinationPeer: peerDescriptor1,
        sourcePeer: peerDescriptor2
    }

    beforeEach(() => {
        connections = new Map()
        recursiveFinder = new RecursiveFinder({
            ownPeerDescriptor: peerDescriptor1,
            ownPeerId: peerId1,
            router: new MockRouter(),
            connections,
            serviceId: 'RecursiveFinder',
            localDataStore: new LocalDataStore(),
            sessionTransport: new MockTransport(),
            addContact: (_contact, _setActive) => {},
            getClosestPeerDescriptors: (_kademliaId, _limit) => [],
            isPeerCloserToIdThanSelf: (_peer1, _compareToId) => true,
            rpcCommunicator: createMockRoutingRpcCommunicator()
        })
    })

    afterEach(() => {
        recursiveFinder.stop()
    })

    it('RecursiveFinder server', async () => {
        const res = await recursiveFinder.findRecursively(routedMessage)
        expect(res.error).toEqual('')
    })

    it('startRecursiveFind with mode Node returns self if no peers', async () => {
        const res = await recursiveFinder.startRecursiveFind(PeerID.fromString('find').value)
        expect(isSamePeerDescriptor(res.closestNodes[0], peerDescriptor1)).toEqual(true)
    })

    it('RecursiveFinder server throws if payload is not recursiveFindRequest', async () => {
        const rpcWrapper = createWrappedClosestPeersRequest(peerDescriptor1, peerDescriptor2)
        const badMessage: Message = {
            serviceId: 'unknown',
            messageId: v4(),
            messageType: MessageType.RPC,
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: rpcWrapper
            },
            sourceDescriptor: peerDescriptor1,
            targetDescriptor: peerDescriptor2
        }
        await expect(recursiveFinder.findRecursively({
            message: badMessage,
            requestId: 'REQ',
            routingPath: [],
            reachableThrough: [],
            destinationPeer: peerDescriptor1,
            sourcePeer: peerDescriptor2
        })).rejects.toThrow()
    })

})

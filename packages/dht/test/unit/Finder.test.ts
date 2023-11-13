import {
    Message,
    MessageType,
    NodeType,
    PeerDescriptor,
    RouteMessageAck,
    RouteMessageWrapper
} from '../../src/proto/packages/dht/protos/DhtRpc'
import { PeerID, PeerIDKey } from '../../src/helpers/PeerID'
import {
    createWrappedClosestPeersRequest,
    createFindRequest
} from '../utils/utils'
import { Finder } from '../../src/dht/find/Finder'
import { DhtNodeRpcRemote } from '../../src/dht/DhtNodeRpcRemote'
import { LocalDataStore } from '../../src/dht/store/LocalDataStore'
import { v4 } from 'uuid'
import { MockRouter } from '../utils/mock/Router'
import { MockTransport } from '../utils/mock/Transport'
import { areEqualPeerDescriptors } from '../../src/helpers/peerIdFromPeerDescriptor'
import { FakeRpcCommunicator } from '../utils/FakeRpcCommunicator'

describe('Finder', () => {

    let finder: Finder
    let connections: Map<PeerIDKey, DhtNodeRpcRemote>

    const peerDescriptor1: PeerDescriptor = {
        kademliaId: PeerID.fromString('peerid').value,
        type: NodeType.NODEJS
    }
    const peerDescriptor2: PeerDescriptor = {
        kademliaId: PeerID.fromString('destination').value,
        type: NodeType.NODEJS
    }
    const findRequest = createFindRequest(false)
    const message: Message = {
        serviceId: 'unknown',
        messageId: v4(),
        messageType: MessageType.RPC,
        body: {
            oneofKind: 'findRequest',
            findRequest
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
    const rpcCommunicator = new FakeRpcCommunicator()

    beforeEach(() => {
        connections = new Map()
        finder = new Finder({
            localPeerDescriptor: peerDescriptor1,
            router: new MockRouter(),
            connections,
            serviceId: 'Finder',
            localDataStore: new LocalDataStore(),
            sessionTransport: new MockTransport(),
            addContact: (_contact, _setActive) => {},
            isPeerCloserToIdThanSelf: (_peer1, _compareToId) => true,
            rpcCommunicator: rpcCommunicator as any
        })
    })

    afterEach(() => {
        finder.stop()
    })

    it('Finder server', async () => {
        const res = await rpcCommunicator.callRpcMethod('routeFindRequest', routedMessage) as RouteMessageAck
        expect(res.error).toEqual('')
    })

    it('startFind with mode Node returns self if no peers', async () => {
        const res = await finder.startFind(PeerID.fromString('find').value)
        expect(areEqualPeerDescriptors(res.closestNodes[0], peerDescriptor1)).toEqual(true)
    })

    it('Finder server throws if payload is not FindRequest', async () => {
        const rpcWrapper = createWrappedClosestPeersRequest(peerDescriptor1)
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
        await expect(() => rpcCommunicator.callRpcMethod('routeFindRequest', {
            message: badMessage,
            requestId: 'REQ',
            routingPath: [],
            reachableThrough: [],
            destinationPeer: peerDescriptor1,
            sourcePeer: peerDescriptor2
        })).rejects.toThrow()
    })

})

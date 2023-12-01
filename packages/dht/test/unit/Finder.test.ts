import {
    FindAction,
    Message,
    MessageType,
    NodeType,
    PeerDescriptor,
    RouteMessageAck,
    RouteMessageError,
    RouteMessageWrapper
} from '../../src/proto/packages/dht/protos/DhtRpc'
import { PeerID } from '../../src/helpers/PeerID'
import {
    createWrappedClosestPeersRequest,
    createFindRequest
} from '../utils/utils'
import { Finder } from '../../src/dht/find/Finder'
import { LocalDataStore } from '../../src/dht/store/LocalDataStore'
import { v4 } from 'uuid'
import { MockRouter } from '../utils/mock/Router'
import { MockTransport } from '../utils/mock/Transport'
import { areEqualPeerDescriptors } from '../../src/helpers/peerIdFromPeerDescriptor'
import { FakeRpcCommunicator } from '../utils/FakeRpcCommunicator'
import { IRouter } from '../../src/dht/routing/Router'
import { ITransport } from '../../src/exports'

const createMockRouter = (error?: RouteMessageError): Partial<IRouter> => {
    return {
        doRouteMessage: (routedMessage: RouteMessageWrapper) => {
            return {
                requestId: routedMessage.requestId,
                error
            }
        },
        isMostLikelyDuplicate: () => false,
        addToDuplicateDetector: () => {}
    }
}
describe('Finder', () => {

    const peerDescriptor1: PeerDescriptor = {
        nodeId: PeerID.fromString('peerid').value,
        type: NodeType.NODEJS
    }
    const peerDescriptor2: PeerDescriptor = {
        nodeId: PeerID.fromString('destination').value,
        type: NodeType.NODEJS
    }
    const findRequest = createFindRequest(FindAction.NODE)
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
        sourcePeer: peerDescriptor1,
        destinationPeer: peerDescriptor2
    }
    const rpcCommunicator = new FakeRpcCommunicator()

    const createFinder = (router: IRouter = new MockRouter(), transport: ITransport = new MockTransport()): Finder => {
        return new Finder({
            localPeerDescriptor: peerDescriptor1,
            router,
            connections: new Map(),
            serviceId: 'Finder',
            localDataStore: new LocalDataStore(30 * 100),
            sessionTransport: transport,
            addContact: () => {},
            isPeerCloserToIdThanSelf: (_peer1, _compareToId) => true,
            rpcCommunicator: rpcCommunicator as any
        })
    }

    it('Finder server', async () => {
        const finder = createFinder()
        const res = await rpcCommunicator.callRpcMethod('routeFindRequest', routedMessage) as RouteMessageAck
        expect(res.error).toBeUndefined()
        finder.stop()
    })

    it('startFind with mode Node returns self if no peers', async () => {
        const finder = createFinder()
        const res = await finder.startFind(PeerID.fromString('find').value)
        expect(areEqualPeerDescriptors(res.closestNodes[0], peerDescriptor1)).toEqual(true)
        finder.stop()
    })

    it('Finder server throws if payload is not FindRequest', async () => {
        const finder = createFinder(new MockRouter())
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
        finder.stop()
    })

    it('no targets', async () => {
        const router = createMockRouter(RouteMessageError.NO_TARGETS)
        const send = jest.fn()
        const transport = { 
            send,
            on: () => {},
            off: () => {}
        }
        const finder = createFinder(router as any, transport as any)
        const ack = await rpcCommunicator.callRpcMethod('routeFindRequest', routedMessage)
        expect(ack).toEqual({
            requestId: routedMessage.requestId,
            error: RouteMessageError.NO_TARGETS
        })
        expect(send).toHaveBeenCalledTimes(1)
        finder.stop()
    })

    it('error', async () => {
        const router = createMockRouter(RouteMessageError.DUPLICATE)
        const send = jest.fn()
        const transport = { 
            send
        }
        const finder = createFinder(router as any, transport as any)
        const ack = await rpcCommunicator.callRpcMethod('routeFindRequest', routedMessage)
        expect(ack).toEqual({
            requestId: routedMessage.requestId,
            error: RouteMessageError.DUPLICATE
        })
        expect(send).not.toHaveBeenCalled()
        finder.stop()
    })
})

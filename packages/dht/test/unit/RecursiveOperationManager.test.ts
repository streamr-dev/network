import {
    RecursiveOperation,
    Message,
    MessageType,
    RouteMessageAck,
    RouteMessageError,
    RouteMessageWrapper
} from '../../src/proto/packages/dht/protos/DhtRpc'
import { PeerID } from '../../src/helpers/PeerID'
import {
    createWrappedClosestPeersRequest,
    createFindRequest,
    createMockPeerDescriptor
} from '../utils/utils'
import { RecursiveOperationManager } from '../../src/dht/recursive-operation/RecursiveOperationManager'
import { LocalDataStore } from '../../src/dht/store/LocalDataStore'
import { v4 } from 'uuid'
import { MockRouter } from '../utils/mock/Router'
import { MockTransport } from '../utils/mock/Transport'
import { areEqualPeerDescriptors } from '../../src/helpers/peerIdFromPeerDescriptor'
import { FakeRpcCommunicator } from '../utils/FakeRpcCommunicator'
import { Router } from '../../src/dht/routing/Router'
import { ITransport } from '../../src/exports'

const createMockRouter = (error?: RouteMessageError): Partial<Router> => {
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
describe('RecursiveOperationManager', () => {

    const peerDescriptor1 = createMockPeerDescriptor()
    const peerDescriptor2 = createMockPeerDescriptor()
    const recursiveOperationRequest = createFindRequest()
    const message: Message = {
        serviceId: 'unknown',
        messageId: v4(),
        messageType: MessageType.RPC,
        body: {
            oneofKind: 'recursiveOperationRequest',
            recursiveOperationRequest
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
        target: peerDescriptor2.nodeId,
        parallelRoots: []
    }
    const rpcCommunicator = new FakeRpcCommunicator()

    const createRecursiveOperationManager = (
        router: Router = new MockRouter() as any,
        transport: ITransport = new MockTransport()
    ): RecursiveOperationManager => {
        return new RecursiveOperationManager({
            localPeerDescriptor: peerDescriptor1,
            router,
            connections: new Map(),
            serviceId: 'RecursiveOperationManager',
            localDataStore: new LocalDataStore(30 * 100),
            sessionTransport: transport,
            addContact: () => {},
            rpcCommunicator: rpcCommunicator as any
        })
    }

    it('RecursiveOperationManager server', async () => {
        const recursiveOperationManager = createRecursiveOperationManager()
        const res = await rpcCommunicator.callRpcMethod('routeRequest', routedMessage) as RouteMessageAck
        expect(res.error).toBeUndefined()
        recursiveOperationManager.stop()
    })

    it('startFind with mode Node returns self if no peers', async () => {
        const recursiveOperationManager = createRecursiveOperationManager()
        const res = await recursiveOperationManager.execute(PeerID.fromString('find').value, RecursiveOperation.FIND_NODE)
        expect(areEqualPeerDescriptors(res.closestNodes[0], peerDescriptor1)).toEqual(true)
        recursiveOperationManager.stop()
    })

    it('RecursiveOperationManager server throws if payload is not RecursiveOperationRequest', async () => {
        const manager = createRecursiveOperationManager(new MockRouter() as any)
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
        await expect(() => rpcCommunicator.callRpcMethod('routeRequest', {
            message: badMessage,
            requestId: 'REQ',
            routingPath: [],
            reachableThrough: [],
            target: peerDescriptor1.nodeId,
            sourcePeer: peerDescriptor2
        })).rejects.toThrow()
        manager.stop()
    })

    it('no targets', async () => {
        const router = createMockRouter(RouteMessageError.NO_TARGETS)
        const send = jest.fn()
        const transport = { 
            send,
            on: () => {},
            off: () => {}
        }
        const recursiveOperationManager = createRecursiveOperationManager(router as any, transport as any)
        const ack = await rpcCommunicator.callRpcMethod('routeRequest', routedMessage)
        expect(ack).toEqual({
            requestId: routedMessage.requestId,
            error: RouteMessageError.NO_TARGETS
        })
        expect(send).toHaveBeenCalledTimes(1)
        recursiveOperationManager.stop()
    })

    it('error', async () => {
        const router = createMockRouter(RouteMessageError.DUPLICATE)
        const send = jest.fn()
        const transport = { 
            send
        }
        const recursiveOperationManager = createRecursiveOperationManager(router as any, transport as any)
        const ack = await rpcCommunicator.callRpcMethod('routeRequest', routedMessage)
        expect(ack).toEqual({
            requestId: routedMessage.requestId,
            error: RouteMessageError.DUPLICATE
        })
        expect(send).not.toHaveBeenCalled()
        recursiveOperationManager.stop()
    })
})

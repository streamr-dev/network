import { RpcCommunicator } from '../../src/RpcCommunicator'
import {
    RpcMessage,
    RpcErrorType
} from '../../src/proto/ProtoRpc'
import { PingRequest, PingResponse } from '../proto/TestProtos'
import { ResultParts } from '../../src/ClientTransport'
import { Deferred, RpcMetadata, RpcStatus, ServerCallContext } from '@protobuf-ts/runtime-rpc'
import * as Err from '../../src/errors'
import { MockDhtRpc, PingRequestDecorator } from '../utils'
import { ProtoCallContext } from '../../src/ProtoCallContext'
import { waitForCondition } from '@streamr/utils'
import { Any } from '../../src/proto/google/protobuf/any'
import { Empty } from '../proto/google/protobuf/empty'

describe('RpcCommunicator', () => {
    let rpcCommunicator: RpcCommunicator

    let mockDhtRpc: MockDhtRpc
    let promises: ResultParts
    let request: RpcMessage
    let responseRpcMessage: RpcMessage

    beforeEach(() => {
        rpcCommunicator = new RpcCommunicator({ rpcRequestTimeout: 1000 })

        const deferredParser = (bytes: Uint8Array) => PingResponse.fromBinary(bytes)
        promises = {
            header: new Deferred<RpcMetadata>(),
            message: new Deferred<PingResponse>(),
            status: new Deferred<RpcStatus>(),
            trailer: new Deferred<RpcMetadata>(),
            messageParser: deferredParser
        }
        request = {
            requestId: 'message',
            header: {
                method: 'ping',
                request: 'request',
            },
            body: Any.pack({ requestId: 'requestId' }, PingRequest)
        }
        responseRpcMessage = {
            requestId: 'message',
            header: {
                method: 'ping',
                response: 'response',
            },
            body: Any.pack({ requestId: 'requestId' }, PingResponse),
        }
    })

    afterEach(() => {
        rpcCommunicator.stop()
    })

    beforeAll(() => {
        mockDhtRpc = new MockDhtRpc()
    })

    afterAll(() => {
        MockDhtRpc.clearMockTimeouts()
    })

    it('Resolves Promises', async () => {
        // @ts-expect-error private 
        rpcCommunicator.onOutgoingMessage(request, promises)
        // @ts-expect-error private 
        expect(rpcCommunicator.ongoingRequests.size).toEqual(1)
        rpcCommunicator.handleIncomingMessage(responseRpcMessage)
        const pong = await promises.message.promise
        expect(pong).toEqual({ requestId: 'requestId' })
        // @ts-expect-error private 
        expect(rpcCommunicator.ongoingRequests.size).toEqual(0)
    })

    it('Timeouts Promises', async () => {
        // @ts-expect-error private 
        rpcCommunicator.onOutgoingMessage(request, promises)
        // @ts-expect-error private 
        expect(rpcCommunicator.ongoingRequests.size).toEqual(1)
        await expect(promises.message.promise)
            .rejects
            .toEqual(new Err.RpcTimeout('Rpc request timed out'))
        // @ts-expect-error private 
        expect(rpcCommunicator.ongoingRequests.size).toEqual(0)
    })

    it('Rejects on error response', async () => {
        const errorResponse: RpcMessage = {
            ...responseRpcMessage,
            errorType: RpcErrorType.SERVER_ERROR,
            errorMessage: 'Server error on request'
        }
        //response.body = RpcMessage.toBinary(errorResponse)
        // @ts-expect-error private 
        rpcCommunicator.onOutgoingMessage(request, promises)
        // @ts-expect-error private 
        expect(rpcCommunicator.ongoingRequests.size).toEqual(1)
        rpcCommunicator.handleIncomingMessage(errorResponse)
        await expect(promises.message.promise)
            .rejects
            .toEqual(new Err.RpcServerError('Server error on request'))
        // @ts-expect-error private 
        expect(rpcCommunicator.ongoingRequests.size).toEqual(0)
    })

    it('Rejects on server timeout response', async () => {
        const errorResponse: RpcMessage = {
            ...responseRpcMessage,
            errorType: RpcErrorType.SERVER_TIMEOUT
        }
        //response.body = RpcMessage.toBinary(errorResponse)
        // @ts-expect-error private 
        rpcCommunicator.onOutgoingMessage(request, promises)
        // @ts-expect-error private 
        expect(rpcCommunicator.ongoingRequests.size).toEqual(1)
        rpcCommunicator.handleIncomingMessage(errorResponse)
        await expect(promises.message.promise)
            .rejects
            .toEqual(new Err.RpcTimeout('Server timed out on request'))
        // @ts-expect-error private 
        expect(rpcCommunicator.ongoingRequests.size).toEqual(0)
    })

    it('Rejects on unknown method', async () => {
        const errorResponse: RpcMessage = {
            ...responseRpcMessage,
            errorType: RpcErrorType.UNKNOWN_RPC_METHOD
        }
        //response.body = RpcMessage.toBinary(errorResponse)
        // @ts-expect-error private 
        rpcCommunicator.onOutgoingMessage(request, promises)
        // @ts-expect-error private 
        expect(rpcCommunicator.ongoingRequests.size).toEqual(1)
        rpcCommunicator.handleIncomingMessage(errorResponse)
        await expect(promises.message.promise)
            .rejects
            .toEqual(new Err.RpcRequest(`Server does not implement method ping`))
        // @ts-expect-error private 
        expect(rpcCommunicator.ongoingRequests.size).toEqual(0)
    })

    it('Success responses to requests', async () => {
        let successCounter = 0
        rpcCommunicator.registerRpcMethod(PingRequest, PingResponse, 'ping', mockDhtRpc.ping)
        rpcCommunicator.on('outgoingMessage', (message: RpcMessage, _requestId: string, _ucallContext?: ProtoCallContext) => {
            if (!message.errorType) {
                successCounter += 1
            }
        })

        rpcCommunicator.handleIncomingMessage(request)
        await waitForCondition(() => successCounter === 1)
    })

    it('Success responses to new registration method', async () => {
        let successCounter = 0
        rpcCommunicator.registerRpcMethod(PingRequest, PingResponse, 'ping', mockDhtRpc.ping)
        rpcCommunicator.on('outgoingMessage', (message: RpcMessage, _requestId: string, _ucallContext?: ProtoCallContext) => {
            //const pongWrapper = RpcMessage.fromBinary(message)
            if (!message.errorType) {
                successCounter += 1
            }
        })

        rpcCommunicator.handleIncomingMessage(request, new ProtoCallContext())
        await waitForCondition(() => successCounter === 1)
    })

    it('Can use request decorator', async () => {
        let successCounter = 0
        // Note that trying to register a decorated method without passing 
        // the decorator constructor causes a compiler error as expected:  
        // rpcCommunicator.registerRpcMethod(PingRequest, PingResponse,
        // 'ping', MockDhtRpc.decoratedPing, {})

        rpcCommunicator.registerRpcMethod(PingRequest, PingResponse,
            'ping', mockDhtRpc.decoratedPing, {}, PingRequestDecorator)
        rpcCommunicator.on('outgoingMessage', (message: RpcMessage, _requestId: string, _ucallContext?: ProtoCallContext) => {
            if (!message.errorType &&
                Any.unpack(message.body!, PingResponse).requestId === 'decorated:requestId') {
                successCounter += 1
            }
        })

        rpcCommunicator.handleIncomingMessage(request, new ProtoCallContext())
        await waitForCondition(() => successCounter === 1)
    })

    it('Can use notification decorator', async () => {
        let decoratedResult = ''
        const pingNotification = async (request: PingRequestDecorator, _context: ServerCallContext): Promise<Empty> => {
            decoratedResult = request.getRequestId()
            return {}
        }
        const notificationRequest = {
            requestId: 'message',
            header: {
                method: 'pingNotification',
                request: 'request',
                notification: 'true'
            },
            body: Any.pack({ requestId: 'requestId' }, PingRequest)
        }
        rpcCommunicator.registerRpcNotification(PingRequest,
            'pingNotification', pingNotification, {}, PingRequestDecorator)

        rpcCommunicator.handleIncomingMessage(notificationRequest, new ProtoCallContext())
        await waitForCondition(() => decoratedResult === 'decorated:requestId')
    })

    it('Error response on unknown method', async () => {
        let errorCounter = 0
        rpcCommunicator.on('outgoingMessage', (message: RpcMessage, _requestId: string, _ucallContext?: ProtoCallContext) => {
            if (message.errorType && message.errorType === RpcErrorType.UNKNOWN_RPC_METHOD) {
                errorCounter += 1
            }
        })

        rpcCommunicator.handleIncomingMessage(request)
        await waitForCondition(() => errorCounter === 1)
    })

    it('Error response on server timeout', async () => {
        let errorCounter = 0

        rpcCommunicator.registerRpcMethod(PingRequest, PingResponse, 'ping', MockDhtRpc.respondPingWithTimeout)
        rpcCommunicator.on('outgoingMessage', (message: RpcMessage, _requestId: string, _ucallContext?: ProtoCallContext) => {
            //const pongWrapper = RpcMessage.fromBinary(message)
            if (message.errorType !== undefined && message.errorType === RpcErrorType.SERVER_TIMEOUT as RpcErrorType) {
                errorCounter += 1
            }
        })

        rpcCommunicator.handleIncomingMessage(request)
        await waitForCondition(() => errorCounter === 1)
    })

    it('Error response on server timeout', async () => {
        let errorCounter = 0
        rpcCommunicator.registerRpcMethod(PingRequest, PingResponse, 'ping', mockDhtRpc.throwPingError)
        rpcCommunicator.on('outgoingMessage', (message: RpcMessage, _requestId: string, _ucallContext?: ProtoCallContext) => {
            //const pongWrapper = RpcMessage.fromBinary(message)
            if (message.errorType !== undefined && message.errorType === RpcErrorType.SERVER_ERROR) {
                errorCounter += 1
            }
        })

        rpcCommunicator.handleIncomingMessage(request)
        await waitForCondition(() => errorCounter === 1)
    })
})

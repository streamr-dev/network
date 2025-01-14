import { RpcCommunicator } from '../../src/RpcCommunicator'
import { RpcMessage, RpcErrorType } from '../../generated/ProtoRpc'
import { PingRequest, PingResponse } from '../proto/TestProtos'
import { ResultParts } from '../../src/ClientTransport'
import { Deferred, RpcMetadata, RpcStatus } from '@protobuf-ts/runtime-rpc'
import * as Err from '../../src/errors'
import { MockDhtRpc, clearMockTimeouts } from '../utils'
import { ProtoCallContext } from '../../src/ProtoCallContext'
import { until } from '@streamr/utils'
import { Any } from '../../generated/google/protobuf/any'

describe('RpcCommunicator', () => {
    let rpcCommunicator: RpcCommunicator<ProtoCallContext>

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
                request: 'request'
            },
            body: Any.pack({ requestId: 'requestId' }, PingRequest)
        }
        responseRpcMessage = {
            requestId: 'message',
            header: {
                method: 'ping',
                response: 'response'
            },
            body: Any.pack({ requestId: 'requestId' }, PingResponse)
        }
        /*
        response = {
            appId,
            messageId: 'aaaa',
            body: RpcMessage.toBinary(responseRpcMessage),
            messageType: MessageType.RPC
        } */
    })

    afterEach(() => {
        rpcCommunicator.stop()
    })

    afterAll(() => {
        clearMockTimeouts()
    })

    it('Resolves Promises', async () => {
        // @ts-expect-error private
        rpcCommunicator.onOutgoingMessage(request, new ProtoCallContext(), promises)
        // @ts-expect-error private
        expect(rpcCommunicator.ongoingRequests.size).toEqual(1)
        rpcCommunicator.handleIncomingMessage(responseRpcMessage, new ProtoCallContext())
        const pong = await promises.message.promise
        expect(pong).toEqual({ requestId: 'requestId' })
        // @ts-expect-error private
        expect(rpcCommunicator.ongoingRequests.size).toEqual(0)
    })

    it('Timeouts Promises', async () => {
        // @ts-expect-error private
        rpcCommunicator.onOutgoingMessage(request, new ProtoCallContext(), promises)
        // @ts-expect-error private
        expect(rpcCommunicator.ongoingRequests.size).toEqual(1)
        await expect(promises.message.promise).rejects.toEqual(new Err.RpcTimeout('Rpc request timed out'))
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
        rpcCommunicator.onOutgoingMessage(request, new ProtoCallContext(), promises)
        // @ts-expect-error private
        expect(rpcCommunicator.ongoingRequests.size).toEqual(1)
        rpcCommunicator.handleIncomingMessage(errorResponse, new ProtoCallContext())
        await expect(promises.message.promise).rejects.toEqual(new Err.RpcServerError('Server error on request'))
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
        rpcCommunicator.onOutgoingMessage(request, new ProtoCallContext(), promises)
        // @ts-expect-error private
        expect(rpcCommunicator.ongoingRequests.size).toEqual(1)
        rpcCommunicator.handleIncomingMessage(errorResponse, new ProtoCallContext())
        await expect(promises.message.promise).rejects.toEqual(new Err.RpcTimeout('Server timed out on request'))
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
        rpcCommunicator.onOutgoingMessage(request, new ProtoCallContext(), promises)
        // @ts-expect-error private
        expect(rpcCommunicator.ongoingRequests.size).toEqual(1)
        rpcCommunicator.handleIncomingMessage(errorResponse, new ProtoCallContext())
        await expect(promises.message.promise).rejects.toEqual(
            new Err.RpcRequest(`Server does not implement method ping`)
        )
        // @ts-expect-error private
        expect(rpcCommunicator.ongoingRequests.size).toEqual(0)
    })

    it('Success responses to requests', async () => {
        let successCounter = 0
        rpcCommunicator.registerRpcMethod(PingRequest, PingResponse, 'ping', MockDhtRpc.ping)
        rpcCommunicator.setOutgoingMessageListener(
            async (message: RpcMessage, _requestId: string, _callContext?: ProtoCallContext) => {
                if (!message.errorType) {
                    successCounter += 1
                }
            }
        )

        rpcCommunicator.handleIncomingMessage(request, new ProtoCallContext())
        await until(() => successCounter === 1)
    })

    it('Success responses to new registration method', async () => {
        let successCounter = 0
        rpcCommunicator.registerRpcMethod(PingRequest, PingResponse, 'ping', MockDhtRpc.ping)
        rpcCommunicator.setOutgoingMessageListener(
            async (message: RpcMessage, _requestId: string, _ucallContext?: ProtoCallContext) => {
                if (!message.errorType) {
                    successCounter += 1
                }
            }
        )

        rpcCommunicator.handleIncomingMessage(request, new ProtoCallContext())
        await until(() => successCounter === 1)
    })

    it('Error response on unknown method', async () => {
        let errorCounter = 0
        rpcCommunicator.setOutgoingMessageListener(
            async (message: RpcMessage, _requestId: string, _ucallContext?: ProtoCallContext) => {
                //const pongWrapper = RpcMessage.fromBinary(message)
                if (message.errorType && message.errorType === RpcErrorType.UNKNOWN_RPC_METHOD) {
                    errorCounter += 1
                }
            }
        )

        rpcCommunicator.handleIncomingMessage(request, new ProtoCallContext())
        await until(() => errorCounter === 1)
    })

    it('Error response on server timeout', async () => {
        let errorCounter = 0

        rpcCommunicator.registerRpcMethod(PingRequest, PingResponse, 'ping', MockDhtRpc.respondPingWithTimeout)
        rpcCommunicator.setOutgoingMessageListener(
            async (message: RpcMessage, _requestId: string, _ucallContext?: ProtoCallContext) => {
                if (
                    message.errorType !== undefined &&
                    message.errorType === (RpcErrorType.SERVER_TIMEOUT as RpcErrorType)
                ) {
                    errorCounter += 1
                }
            }
        )

        rpcCommunicator.handleIncomingMessage(request, new ProtoCallContext())
        await until(() => errorCounter === 1)
    })

    it('Error response on server error', async () => {
        let errorCounter = 0
        rpcCommunicator.registerRpcMethod(PingRequest, PingResponse, 'ping', MockDhtRpc.throwPingError)
        rpcCommunicator.setOutgoingMessageListener(
            async (message: RpcMessage, _requestId: string, _ucallContext?: ProtoCallContext) => {
                if (message.errorType !== undefined && message.errorType === RpcErrorType.SERVER_ERROR) {
                    errorCounter += 1
                }
            }
        )

        rpcCommunicator.handleIncomingMessage(request, new ProtoCallContext())
        await until(() => errorCounter === 1)
    })

    it('getRequestIds', () => {
        // @ts-expect-error private
        rpcCommunicator.onOutgoingMessage(request, { nodeId: 'test' }, promises)
        // @ts-expect-error private
        expect(rpcCommunicator.ongoingRequests.size).toEqual(1)
        const matchingOngoingRequests = rpcCommunicator.getRequestIds(
            (request) => request.getCallContext().nodeId === 'test'
        )
        expect(matchingOngoingRequests.length).toEqual(1)
        const noMatchingOngoingRequests = rpcCommunicator.getRequestIds(
            (request) => request.getCallContext().nodeId === 'nope'
        )
        expect(noMatchingOngoingRequests.length).toEqual(0)
    })
})

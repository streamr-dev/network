import { RpcCommunicator } from '../../src/RpcCommunicator'
import {
    RpcMessage,
    RpcErrorType
} from '../../src/proto/ProtoRpc'
import { PingRequest, PingResponse } from '../proto/TestProtos' 
import { ResultParts } from '../../src/ClientTransport'
import { Deferred, RpcMetadata, RpcStatus } from '@protobuf-ts/runtime-rpc'
import * as Err from '../../src/errors'
import { MockDhtRpc, clearMockTimeouts } from '../utils'
import { ProtoCallContext } from '../../src/ProtoCallContext'
import { waitForCondition } from '@streamr/utils'
import { Any } from '../../src/proto/google/protobuf/any'

describe('RpcCommunicator', () => {
    let rpcCommunicator: RpcCommunicator

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
        /*
        response = {
            appId: appId,
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
        rpcCommunicator.onOutgoingMessage(request, promises)
        rpcCommunicator.handleIncomingMessage(responseRpcMessage)
        const pong = await promises.message.promise
        expect(pong).toEqual({ requestId: 'requestId' })
    })

    it('Timeouts Promises', async () => {
        // @ts-expect-error private 
        rpcCommunicator.onOutgoingMessage(request, promises)
        await expect(promises.message.promise)
            .rejects
            .toEqual(new Err.RpcTimeout('Rpc request timed out'))
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
        rpcCommunicator.handleIncomingMessage(errorResponse)
        await expect(promises.message.promise)
            .rejects
            .toEqual(new Err.RpcServerError('Server error on request'))
    })

    it('Rejects on server timeout response', async () => {
        const errorResponse: RpcMessage = {
            ...responseRpcMessage,
            errorType: RpcErrorType.SERVER_TIMEOUT
        }
        //response.body = RpcMessage.toBinary(errorResponse)
        // @ts-expect-error private 
        rpcCommunicator.onOutgoingMessage(request, promises)
        rpcCommunicator.handleIncomingMessage(errorResponse)
        await expect(promises.message.promise)
            .rejects
            .toEqual(new Err.RpcTimeout('Server timed out on request'))
    })

    it('Rejects on unknown method', async () => {
        const errorResponse: RpcMessage = {
            ...responseRpcMessage,
            errorType: RpcErrorType.UNKNOWN_RPC_METHOD
        }
        //response.body = RpcMessage.toBinary(errorResponse)
        // @ts-expect-error private 
        rpcCommunicator.onOutgoingMessage(request, promises)
        rpcCommunicator.handleIncomingMessage(errorResponse)
        await expect(promises.message.promise)
            .rejects
            .toEqual(new Err.RpcRequest(`Server does not implement method ping`))
    })

    it('Success responses to requests', async () => {
        let successCounter = 0
        rpcCommunicator.registerRpcMethod(PingRequest, PingResponse, 'ping', MockDhtRpc.ping)
        rpcCommunicator.on('outgoingMessage', (message: RpcMessage, _requestId: string, _ucallContext?: ProtoCallContext) => {
            //const pongWrapper = RpcMessage.fromBinary(message)
            if (!message.errorType) {
                successCounter += 1
            }
        })
        
        rpcCommunicator.handleIncomingMessage(request)
        await waitForCondition(() => successCounter === 1)
    })

    it('Success responses to new registration method', async () => {
        let successCounter = 0
        rpcCommunicator.registerRpcMethod(PingRequest, PingResponse, 'ping', MockDhtRpc.ping)
        rpcCommunicator.on('outgoingMessage', (message: RpcMessage, _requestId: string, _ucallContext?: ProtoCallContext) => {
            //const pongWrapper = RpcMessage.fromBinary(message)
            if (!message.errorType) {
                successCounter += 1
            }
        })
        
        rpcCommunicator.handleIncomingMessage(request, new ProtoCallContext())
        await waitForCondition(() => successCounter === 1)
    })

    it('Error response on unknown method', async () => {
        let errorCounter = 0
        rpcCommunicator.on('outgoingMessage', (message: RpcMessage, _requestId: string, _ucallContext?: ProtoCallContext) => {
            //const pongWrapper = RpcMessage.fromBinary(message)
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
        rpcCommunicator.registerRpcMethod(PingRequest, PingResponse, 'ping', MockDhtRpc.throwPingError)
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

import { RpcCommunicator, Event as RpcCommunicatorEvent } from '../../src/transport/RpcCommunicator'
import { MockConnectionManager } from '../../src/connection/MockConnectionManager'
import {
    Message,
    MessageType,
    NotificationResponse,
    PeerDescriptor,
    PingRequest,
    PingResponse,
    RpcMessage,
    RpcResponseError
} from '../../src/proto/DhtRpc'
import { generateId } from '../../src/dht/helpers'
import { Simulator } from '../../src/connection/Simulator'
import { DeferredPromises } from '../../src/rpc-protocol/ClientTransport'
import { Deferred, RpcMetadata, RpcStatus } from '@protobuf-ts/runtime-rpc'
import { Err } from '../../src/errors'
import { waitForEvent } from 'streamr-test-utils'

describe('RpcCommunicator', () => {
    let rpcCommunicator: RpcCommunicator
    const simulator = new Simulator()
    const appId = 'unitTest'

    const peerDescriptor1: PeerDescriptor = {
        peerId: generateId('peer1'),
        type: 0
    }
    const peerDescriptor2: PeerDescriptor = {
        peerId: generateId('peer2'),
        type: 0
    }
    let promises: DeferredPromises
    let request: RpcMessage
    let responseRpcMessage: RpcMessage
    let response: Message

    beforeEach(() => {
        rpcCommunicator = new RpcCommunicator({
            connectionLayer: new MockConnectionManager(peerDescriptor1, simulator),
            rpcRequestTimeout: 1000,
            appId
        })
        rpcCommunicator.setSendFn(() => {})

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
            body: PingRequest.toBinary({nonce: 'nonce'}),
            sourceDescriptor: peerDescriptor1,
            targetDescriptor: peerDescriptor2
        }
        responseRpcMessage = {
            requestId: 'message',
            header: {
                method: 'ping',
                response: 'response',
            },
            body: PingResponse.toBinary({nonce: 'nonce'}),
            sourceDescriptor: peerDescriptor2,
            targetDescriptor: peerDescriptor1
        }
        response = {
            messageId: 'aaaa',
            body: RpcMessage.toBinary(responseRpcMessage),
            messageType: MessageType.RPC
        }
    })

    afterEach(() => {
        rpcCommunicator.stop()
    })

    it('Resolves Promises', async () => {
        rpcCommunicator.onOutgoingMessage(request, promises)
        rpcCommunicator.onIncomingMessage(peerDescriptor2, response)
        const pong = await promises.message.promise
        expect(pong).toEqual({nonce: 'nonce'})
    })

    it('Timeouts Promises', async () => {
        rpcCommunicator.onOutgoingMessage(request, promises)
        await expect(promises.message.promise)
            .rejects
            .toEqual(new Err.RpcTimeout('Rpc request timed out'))
    })

    it('Rejects on error response', async () => {
        const errorResponse: RpcMessage = {
            ...responseRpcMessage,
            responseError: RpcResponseError.SERVER_ERROR
        }
        response.body = RpcMessage.toBinary(errorResponse)
        rpcCommunicator.onOutgoingMessage(request, promises)
        rpcCommunicator.onIncomingMessage(peerDescriptor2, response)
        await expect(promises.message.promise)
            .rejects
            .toEqual(new Err.RpcRequest('Server error on request'))
    })

    it('Rejects on server timeout response', async () => {
        const errorResponse: RpcMessage = {
            ...responseRpcMessage,
            responseError: RpcResponseError.SERVER_TIMOUT
        }
        response.body = RpcMessage.toBinary(errorResponse)
        rpcCommunicator.onOutgoingMessage(request, promises)
        rpcCommunicator.onIncomingMessage(peerDescriptor2, response)
        await expect(promises.message.promise)
            .rejects
            .toEqual(new Err.RpcRequest('Server timed out on request'))
    })

    it('Rejects on unknown method', async () => {
        const errorResponse: RpcMessage = {
            ...responseRpcMessage,
            responseError: RpcResponseError.UNKNOWN_RPC_METHOD
        }
        response.body = RpcMessage.toBinary(errorResponse)
        rpcCommunicator.onOutgoingMessage(request, promises)
        rpcCommunicator.onIncomingMessage(peerDescriptor2, response)
        await expect(promises.message.promise)
            .rejects
            .toEqual(new Err.RpcRequest(`Server does not implement method ping`))
    })

    it('Immediately resolves notifications', async () => {
        const notification: RpcMessage = {
            ...request,
            header: {
                ...request.header,
                notification: 'notification'
            }
        }
        promises.messageParser  = (bytes: Uint8Array) => NotificationResponse.fromBinary(bytes)
        rpcCommunicator.onOutgoingMessage(notification, promises)
        const res = await promises.message.promise as NotificationResponse
        expect(res.sent).toEqual(true)
    })

    it('Responds to requests', async () => {
        const requestMessage: Message = {
            messageType: MessageType.RPC,
            messageId: 'id',
            body: RpcMessage.toBinary(request)
        }
        await Promise.all([
            waitForEvent(rpcCommunicator, RpcCommunicatorEvent.OUTGOING_MESSAGE),
            rpcCommunicator.onIncomingMessage(peerDescriptor2, requestMessage)
        ])
    })
})
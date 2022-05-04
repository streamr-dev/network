import { IConnectionManager, Event as ConnectionLayerEvent } from '../connection/IConnectionManager'
import { v4 } from 'uuid'
import EventEmitter = require('events')
import { Err, ErrorCode } from '../errors'
import {
    DeferredPromises,
    DhtRpcOptions,
    DhtTransportClient,
    Event as DhtTransportClientEvent
} from './DhtTransportClient'
import { Message, MessageType, PeerDescriptor, RpcMessage, RpcResponseError } from '../proto/DhtRpc'
import { DhtTransportServer, Event as DhtTransportServerEvent } from './DhtTransportServer'

export enum Event {
    OUTGOING_MESSAGE = 'streamr:dht:transport:rpc-communicator:outgoing-message',
    INCOMING_MESSAGE = 'streamr:dht:transport:rpc-communicator:incoming-message'
}

export interface RpcCommunicator {
    on(event: Event.OUTGOING_MESSAGE, listener: () => void): this
    on(event: Event.INCOMING_MESSAGE, listener: () => void): this
}

interface OngoingRequest {
    deferredPromises: DeferredPromises,
    timeoutRef: NodeJS.Timeout
}

export class RpcCommunicator extends EventEmitter {
    private static objectCounter = 0
    private objectId = 0
    private readonly dhtTransportClient: DhtTransportClient
    private readonly dhtTransportServer: DhtTransportServer
    private readonly connectionLayer: IConnectionManager
    private readonly ongoingRequests: Map<string, OngoingRequest>
    public send: (peerDescriptor: PeerDescriptor, message: Message) => void
    constructor(connectionLayer: IConnectionManager, dhtTransportClient: DhtTransportClient, dhtTransportServer: DhtTransportServer) {
        super()
        this.objectId = RpcCommunicator.objectCounter
        RpcCommunicator.objectCounter++

        this.dhtTransportClient = dhtTransportClient
        this.dhtTransportServer = dhtTransportServer
        this.connectionLayer = connectionLayer
        this.ongoingRequests = new Map()
        this.send = ((_peerDescriptor, _bytes) => { throw new Error('send not defined') })
        this.dhtTransportClient.on(DhtTransportClientEvent.RPC_REQUEST, (deferredPromises: DeferredPromises, rpcMessage: RpcMessage) => {
            this.onOutgoingMessage(rpcMessage, deferredPromises)
        })
        this.dhtTransportServer.on(DhtTransportServerEvent.RPC_RESPONSE, (rpcMessage: RpcMessage) => {
            this.onOutgoingMessage(rpcMessage)
        })
        this.connectionLayer.on(ConnectionLayerEvent.MESSAGE, async (peerDescriptor: PeerDescriptor, message: Message) =>
            await this.onIncomingMessage(peerDescriptor, message)
        )
    }

    onOutgoingMessage(rpcMessage: RpcMessage, deferredPromises?: DeferredPromises, options?: DhtRpcOptions): void {
        const requestOptions = this.dhtTransportClient.mergeOptions(options)
        if (deferredPromises) {
            this.registerRequest(rpcMessage.requestId, deferredPromises, requestOptions!.timeout as number)
        }
        const msg: Message = {messageId: v4(), messageType: MessageType.RPC, body: RpcMessage.toBinary(rpcMessage)}
        this.send(rpcMessage.targetDescriptor!, msg)
    }

    async onIncomingMessage(senderDescriptor: PeerDescriptor, message: Message): Promise<void> {
        const rpcCall = RpcMessage.fromBinary(message.body)
        if (rpcCall.header.response && this.ongoingRequests.has(rpcCall.requestId)) {
            if (rpcCall.responseError) {
                this.rejectOngoingRequest(rpcCall)
            } else {
                this.resolveOngoingRequest(rpcCall)
            }
        } else if (rpcCall.header.request && rpcCall.header.method) {
            await this.handleRequest(senderDescriptor, rpcCall)
        }
    }

    async handleRequest(senderDescriptor: PeerDescriptor, rpcMessage: RpcMessage): Promise<void> {
        let responseWrapper: RpcMessage
        try {
            const bytes = await this.dhtTransportServer.onRequest(senderDescriptor, rpcMessage)
            responseWrapper = {
                body: bytes,
                header: {
                    response: "response",
                    method: rpcMessage.header.method
                },
                requestId: rpcMessage.requestId,
                targetDescriptor: rpcMessage.sourceDescriptor,
                sourceDescriptor: rpcMessage.targetDescriptor
            }
        } catch (err) {
            let errorType = RpcResponseError.SERVER_ERROR
            if (err.code === ErrorCode.UNKNOWN_RPC_METHOD) {
                errorType = RpcResponseError.UNKNOWN_RPC_METHOD
            }
            responseWrapper = {
                body: new Uint8Array(),
                header: {
                    response: "response",
                    method: rpcMessage.header.method
                },
                requestId: rpcMessage.requestId,
                targetDescriptor: rpcMessage.sourceDescriptor,
                sourceDescriptor: rpcMessage.targetDescriptor,
                responseError: errorType
            }
        }

        this.onOutgoingMessage(responseWrapper)
    }

    registerRequest(requestId: string, deferredPromises: DeferredPromises, timeout = 5000): void {
        const ongoingRequest: OngoingRequest = {
            deferredPromises,
            timeoutRef: setTimeout(() => this.requestTimeoutFn(deferredPromises), timeout)
        }
        this.ongoingRequests.set(requestId, ongoingRequest)
    }

    setSendFn(fn: (peerDescriptor: PeerDescriptor, message: Message) => void): void {
        this.send = fn.bind(this)
    }

    resolveOngoingRequest(response: RpcMessage): void {
        const ongoingRequest = this.ongoingRequests.get(response.requestId)!
        if (ongoingRequest.timeoutRef) {
            clearTimeout(ongoingRequest.timeoutRef)
        }
        const deferredPromises = ongoingRequest!.deferredPromises
        const parsedResponse = deferredPromises.messageParser(response.body)
        deferredPromises.message.resolve(parsedResponse)
        deferredPromises.header.resolve({})
        deferredPromises.status.resolve({code: 'OK', detail: ''})
        deferredPromises.trailer.resolve({})
        this.ongoingRequests.delete(response.requestId)
    }

    rejectOngoingRequest(response: RpcMessage): void {
        const ongoingRequest = this.ongoingRequests.get(response.requestId)!
        if (ongoingRequest.timeoutRef) {
            clearTimeout(ongoingRequest.timeoutRef)
        }
        let error
        if (response.responseError === RpcResponseError.SERVER_TIMOUT) {
            error = new Err.RpcTimeout('Server timed out on request')
        } else if (response.responseError === RpcResponseError.UNKNOWN_RPC_METHOD) {
            error = new Err.RpcRequest(`Server does not implement method ${response.header.method}`)
        } else {
            error = new Err.RpcRequest('Server error on request')
        }
        const deferredPromises = ongoingRequest!.deferredPromises
        deferredPromises.message.reject(error)
        deferredPromises.header.reject(error)
        deferredPromises.status.reject({code: 'SERVER_ERROR', detail: error.message})
        deferredPromises.trailer.reject(error)
        this.ongoingRequests.delete(response.requestId)
    }

    requestTimeoutFn(deferredPromises: DeferredPromises): void {
        const error = new Err.RpcTimeout('Rpc request timed out')
        deferredPromises.message.reject(error)
        deferredPromises.header.reject(error)
        deferredPromises.status.reject({code: 'DEADLINE_EXCEEDED', detail: 'Rpc request timed out'})
        deferredPromises.trailer.reject(error)
    }

    stop(): void {
        this.removeAllListeners()
        this.send = () => {}
    }
}
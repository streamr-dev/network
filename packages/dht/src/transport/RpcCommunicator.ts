import { v4 } from 'uuid'
import { Err, ErrorCode } from '../errors'
import {
    DeferredPromises,
    DhtRpcOptions,
    ClientTransport,
    Event as DhtTransportClientEvent
} from './ClientTransport'
import { Message, MessageType, PeerDescriptor, RpcMessage, RpcResponseError } from '../proto/DhtRpc'
import { ServerTransport, Event as DhtTransportServerEvent } from './ServerTransport'
import { EventEmitter } from 'events'
import { ITransport, Event as ITransportEvent  } from './ITransport'
import { ConnectionManager } from '../connection/ConnectionManager'
import { DEFAULT_APP_ID } from '../dht/DhtNode'
import { DeferredState } from '@protobuf-ts/runtime-rpc'

export enum Event {
    OUTGOING_MESSAGE = 'streamr:dht:transport:rpc-communicator:outgoing-message',
    INCOMING_MESSAGE = 'streamr:dht:transport:rpc-communicator:incoming-message'
}

export interface RpcCommunicatorConstructor {
    connectionLayer: ITransport,
    dhtTransportClient: ClientTransport,
    dhtTransportServer: ServerTransport,
    rpcRequestTimeout?: number,
    appId?: string
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
    private stopped = false
    private static objectCounter = 0
    private objectId = 0
    private readonly dhtTransportClient: ClientTransport
    private readonly dhtTransportServer: ServerTransport
    private readonly connectionLayer: ITransport
    private readonly ongoingRequests: Map<string, OngoingRequest>
    public send: (peerDescriptor: PeerDescriptor, message: Message, appId: string) => void
    private readonly defaultRpcRequestTimeout: number
    private readonly appId: string

    constructor(params: RpcCommunicatorConstructor) {
        super()
        this.objectId = RpcCommunicator.objectCounter
        RpcCommunicator.objectCounter++

        this.appId = params.appId || DEFAULT_APP_ID
        this.dhtTransportClient = params.dhtTransportClient
        this.dhtTransportServer = params.dhtTransportServer
        this.connectionLayer = params.connectionLayer
        this.ongoingRequests = new Map()
        this.send = this.connectionLayer.send.bind(this.connectionLayer)    // ((_peerDescriptor, _bytes) => { throw new Error('send not defined') })
        this.dhtTransportClient.on(DhtTransportClientEvent.RPC_REQUEST, (deferredPromises: DeferredPromises, rpcMessage: RpcMessage) => {
            this.onOutgoingMessage(rpcMessage, deferredPromises)
        })
        this.dhtTransportServer.on(DhtTransportServerEvent.RPC_RESPONSE, (rpcMessage: RpcMessage) => {
            this.onOutgoingMessage(rpcMessage)
        })
        this.connectionLayer.on(ITransportEvent.DATA, async (peerDescriptor: PeerDescriptor, message: Message, appId?: string) => {
            if (appId) {
                console.log(appId)
            }
            if (!appId || appId === this.appId) {
                await this.onIncomingMessage(peerDescriptor, message)
            }
        })
        this.defaultRpcRequestTimeout = params.rpcRequestTimeout || 5000
    }

    onOutgoingMessage(rpcMessage: RpcMessage, deferredPromises?: DeferredPromises, options?: DhtRpcOptions): void {
        const requestOptions = this.dhtTransportClient.mergeOptions(options)
        if (deferredPromises) {
            this.registerRequest(rpcMessage.requestId, deferredPromises, requestOptions!.timeout as number)
        }
        const msg: Message = {messageId: v4(), messageType: MessageType.RPC, body: RpcMessage.toBinary(rpcMessage)}
        this.send(rpcMessage.targetDescriptor!, msg, this.appId)
    }

    async onIncomingMessage(senderDescriptor: PeerDescriptor, message: Message): Promise<void> {
        if (message.messageType !== MessageType.RPC) {
            return
        }
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

    setSendFn(fn: (peerDescriptor: PeerDescriptor, message: Message) => void): void {
        this.send = fn.bind(this)
    }

    private async handleRequest(senderDescriptor: PeerDescriptor, rpcMessage: RpcMessage): Promise<void> {
        let response: RpcMessage
        try {
            const bytes = await this.dhtTransportServer.onRequest(senderDescriptor, rpcMessage)
            response = this.createResponseRpcMessage({
                request: rpcMessage,
                body: bytes
            })
        } catch (err) {
            let responseError = RpcResponseError.SERVER_ERROR
            if (err.code === ErrorCode.UNKNOWN_RPC_METHOD) {
                responseError = RpcResponseError.UNKNOWN_RPC_METHOD
            }
            response = this.createResponseRpcMessage({
                request: rpcMessage,
                responseError
            })
        }
        this.onOutgoingMessage(response)
    }

    private registerRequest(requestId: string, deferredPromises: DeferredPromises, timeout = this.defaultRpcRequestTimeout): void {
        const ongoingRequest: OngoingRequest = {
            deferredPromises,
            timeoutRef: setTimeout(() => this.requestTimeoutFn(deferredPromises), timeout)
        }
        this.ongoingRequests.set(requestId, ongoingRequest)
    }

    private resolveOngoingRequest(response: RpcMessage): void {
        const ongoingRequest = this.ongoingRequests.get(response.requestId)!
        if (ongoingRequest.timeoutRef) {
            clearTimeout(ongoingRequest.timeoutRef)
        }
        const deferredPromises = ongoingRequest!.deferredPromises
        this.resolveDeferredPromises(deferredPromises, response)
        this.ongoingRequests.delete(response.requestId)
    }

    private rejectOngoingRequest(response: RpcMessage): void {
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
        this.rejectDeferredPromises(deferredPromises, error, 'SERVER_ERROR')
        this.ongoingRequests.delete(response.requestId)
    }

    private requestTimeoutFn(deferredPromises: DeferredPromises): void {
        const error = new Err.RpcTimeout('Rpc request timed out', new Error())
        this.rejectDeferredPromises(deferredPromises, error, 'DEADLINE_EXCEEDED')
    }

    private rejectDeferredPromises(deferredPromises: DeferredPromises, error: Error, code: string): void {
        if (!this.stopped && deferredPromises.message.state === DeferredState.PENDING) {
            deferredPromises.message.reject(error)
            deferredPromises.header.reject(error)
            deferredPromises.status.reject({code, detail: error.message})
            deferredPromises.trailer.reject(error)
        }
    }

    private resolveDeferredPromises(deferredPromises: DeferredPromises, response: RpcMessage): void {
        if (!this.stopped && deferredPromises.message.state === DeferredState.PENDING) {
            const parsedResponse = deferredPromises.messageParser(response.body)
            deferredPromises.message.resolve(parsedResponse)
            deferredPromises.header.resolve({})
            deferredPromises.status.resolve({ code: 'OK', detail: '' })
            deferredPromises.trailer.resolve({})
        }
    }

    private createResponseRpcMessage(
        { request, body, responseError }: { request: RpcMessage, body?: Uint8Array, responseError?: RpcResponseError }
    ): RpcMessage {
        return {
            body: body ? body : new Uint8Array(),
            header: {
                response: "response",
                method: request.header.method
            },
            requestId: request.requestId,
            targetDescriptor: request.sourceDescriptor,
            sourceDescriptor: request.targetDescriptor,
            responseError
        }
    }

    public getConnectionManager(): ConnectionManager | never {
        if (this.appId === DEFAULT_APP_ID) {
            return this.connectionLayer as ConnectionManager
        }
        throw new Err.LayerViolation('RpcCommunicator can only access ConnectionManager on layer 0')
    }

    stop(): void {
        this.stopped = true
        this.ongoingRequests.forEach((ongoingRequest: OngoingRequest) => {
            clearTimeout(ongoingRequest.timeoutRef)
            this.rejectDeferredPromises(ongoingRequest.deferredPromises, new Error('stopped'), 'STOPPED')
        })
        this.removeAllListeners()
        this.send = () => {}
        this.ongoingRequests.clear()
    }
}
import { v4 } from 'uuid'
import { Err, ErrorCode } from '../errors'
import {
    ClientTransport,
    DeferredPromises,
    DhtRpcOptions,
    Event as DhtTransportClientEvent
} from '../rpc-protocol/ClientTransport'
import {
    Message,
    MessageType,
    NotificationResponse,
    PeerDescriptor,
    RpcMessage,
    RpcResponseError
} from '../proto/DhtRpc'
import { Event as DhtTransportServerEvent, RegisteredMethod, ServerTransport } from '../rpc-protocol/ServerTransport'
import { EventEmitter } from 'events'
import { Event as ITransportEvent, ITransport } from './ITransport'
import { ConnectionManager } from '../connection/ConnectionManager'
import { DEFAULT_APP_ID } from '../dht/DhtNode'
import { DeferredState } from '@protobuf-ts/runtime-rpc'
import { Logger } from '../helpers/Logger'

export enum Event {
    OUTGOING_MESSAGE = 'streamr:dht:transport:rpc-communicator:outgoing-message',
    INCOMING_MESSAGE = 'streamr:dht:transport:rpc-communicator:incoming-message'
}

export interface RpcCommunicatorConstructor {
    connectionLayer: ITransport,
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

const logger = new Logger(module)

export class RpcCommunicator extends EventEmitter {
    private stopped = false
    private static objectCounter = 0
    private objectId = 0
    private readonly rpcClientTransport: ClientTransport
    private readonly rpcServerTransport: ServerTransport
    private readonly connectionLayer: ITransport
    private readonly ongoingRequests: Map<string, OngoingRequest>
    public send: (peerDescriptor: PeerDescriptor, message: Message, appId: string) => void
    private readonly defaultRpcRequestTimeout: number
    private readonly appId: string

    constructor(params: RpcCommunicatorConstructor) {
        super()
        this.objectId = RpcCommunicator.objectCounter
        RpcCommunicator.objectCounter++

        this.defaultRpcRequestTimeout = params.rpcRequestTimeout || 5000
        this.appId = params.appId || DEFAULT_APP_ID
        this.rpcClientTransport = new ClientTransport(this.defaultRpcRequestTimeout)
        this.rpcServerTransport = new ServerTransport()
        this.connectionLayer = params.connectionLayer
        this.ongoingRequests = new Map()
        this.send = this.connectionLayer.send.bind(this.connectionLayer)    // ((_peerDescriptor, _bytes) => { throw new Error('send not defined') })
        this.rpcClientTransport.on(DhtTransportClientEvent.RPC_REQUEST, (
            deferredPromises: DeferredPromises,
            rpcMessage: RpcMessage,
            options: DhtRpcOptions
        ) => {
            this.onOutgoingMessage(rpcMessage, deferredPromises, options)
        })
        this.rpcServerTransport.on(DhtTransportServerEvent.RPC_RESPONSE, (rpcMessage: RpcMessage) => {
            this.onOutgoingMessage(rpcMessage)
        })
        this.connectionLayer.on(ITransportEvent.DATA, async (peerDescriptor: PeerDescriptor, message: Message, appId?: string) => {
            if (!appId || appId === this.appId) {
                await this.onIncomingMessage(peerDescriptor, message)
            }
        })
    }

    public onOutgoingMessage(rpcMessage: RpcMessage, deferredPromises?: DeferredPromises, options?: DhtRpcOptions): void {
        if (this.stopped) {
            return
        }
        const requestOptions = this.rpcClientTransport.mergeOptions(options)
        if (deferredPromises && rpcMessage.header.notification) {
            this.resolveDeferredPromises(deferredPromises, this.notificationResponse(rpcMessage.requestId))
        } else if (deferredPromises) {
            this.registerRequest(rpcMessage.requestId, deferredPromises, requestOptions!.timeout as number)
        }
        const msg: Message = {messageId: v4(), messageType: MessageType.RPC, body: RpcMessage.toBinary(rpcMessage)}

        logger.trace(`onOutGoingMessage on ${this.appId}, messageId: ${msg.messageId}`)
        this.emit(Event.OUTGOING_MESSAGE)
        this.send(rpcMessage.targetDescriptor!, msg, this.appId)
    }

    public async onIncomingMessage(senderDescriptor: PeerDescriptor, message: Message): Promise<void> {
        if (this.stopped || message.messageType !== MessageType.RPC) {
            return
        }
        logger.trace(`onIncomingMessage on ${this.appId} rpc, messageId: ${message.messageId}`)
        const rpcCall = RpcMessage.fromBinary(message.body)
        if (rpcCall.header.response && this.ongoingRequests.has(rpcCall.requestId)) {
            if (rpcCall.responseError !== undefined) {
                this.rejectOngoingRequest(rpcCall)
            } else {
                this.resolveOngoingRequest(rpcCall)
            }
        } else if (rpcCall.header.request && rpcCall.header.method) {
            if (rpcCall.header.notification) {
                await this.handleNotification(senderDescriptor, rpcCall)
            } else {
                await this.handleRequest(senderDescriptor, rpcCall)
            }
        }
    }

    public setSendFn(fn: (peerDescriptor: PeerDescriptor, message: Message) => void): void {
        this.send = fn.bind(this)
    }

    public getRpcClientTransport(): ClientTransport {
        return this.rpcClientTransport
    }

    public registerServerMethod(methodName: string, fn: RegisteredMethod): void {
        this.rpcServerTransport.registerMethod(methodName, fn)
    }
    private async handleRequest(senderDescriptor: PeerDescriptor, rpcMessage: RpcMessage): Promise<void> {
        if (this.stopped) {
            return
        }
        let response: RpcMessage
        try {
            const bytes = await this.rpcServerTransport.onRequest(senderDescriptor, rpcMessage)
            response = this.createResponseRpcMessage({
                request: rpcMessage,
                body: bytes
            })
        } catch (err) {
            let responseError = RpcResponseError.SERVER_ERROR
            if (err.code === ErrorCode.UNKNOWN_RPC_METHOD) {
                responseError = RpcResponseError.UNKNOWN_RPC_METHOD
            } else if (err.code === ErrorCode.RPC_TIMEOUT) {
                responseError = RpcResponseError.SERVER_TIMOUT
            }
            response = this.createResponseRpcMessage({
                request: rpcMessage,
                responseError
            })
        }
        this.onOutgoingMessage(response)
    }

    private async handleNotification(senderDescriptor: PeerDescriptor, rpcMessage: RpcMessage): Promise<void> {
        if (this.stopped) {
            return
        }
        try {
            await this.rpcServerTransport.onNotification(senderDescriptor, rpcMessage)
        } catch (err) {}
    }

    private registerRequest(requestId: string, deferredPromises: DeferredPromises, timeout = this.defaultRpcRequestTimeout): void {
        if (this.stopped) {
            return
        }
        const ongoingRequest: OngoingRequest = {
            deferredPromises,
            timeoutRef: setTimeout(() => this.requestTimeoutFn(deferredPromises), timeout)
        }
        this.ongoingRequests.set(requestId, ongoingRequest)
    }

    private resolveOngoingRequest(response: RpcMessage): void {
        if (this.stopped) {
            return
        }
        const ongoingRequest = this.ongoingRequests.get(response.requestId)!
        if (ongoingRequest.timeoutRef) {
            clearTimeout(ongoingRequest.timeoutRef)
        }
        const deferredPromises = ongoingRequest!.deferredPromises
        this.resolveDeferredPromises(deferredPromises, response)
        this.ongoingRequests.delete(response.requestId)
    }

    private rejectOngoingRequest(response: RpcMessage): void {
        if (this.stopped) {
            return
        }
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

    private notificationResponse(requestId: string): RpcMessage {
        const notificationResponse: NotificationResponse = {
            sent: true
        }
        const wrapper: RpcMessage = {
            body: NotificationResponse.toBinary(notificationResponse),
            header: {},
            requestId,
        }
        return wrapper
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
        this.rpcClientTransport.stop()
        this.rpcServerTransport.stop()
    }
}
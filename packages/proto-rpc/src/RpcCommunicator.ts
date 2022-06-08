import { Err, ErrorCode } from './errors'
import {
    ClientTransport,
    DeferredPromises,
    ProtoRpcOptions,
    Event as DhtTransportClientEvent
} from './ClientTransport'
import {
    NotificationResponse,
    RpcMessage,
    RpcResponseError
} from './proto/ProtoRpc'
import { CallContext, Event as DhtTransportServerEvent, Parser, Serializer, ServerTransport } from './ServerTransport'
import { EventEmitter } from 'events'
import { DeferredState } from '@protobuf-ts/runtime-rpc'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { Logger } from './Logger'

export enum RpcCommunicatorEvents {
    OUTGOING_MESSAGE = 'streamr:proto-rpc:rpc-communicator:outgoing-message',
}

export interface RpcCommunicatorConfig {
    rpcRequestTimeout?: number,
}

interface IRpcIo {
    handleIncomingMessage(message: Uint8Array, callContext?: CallContext): Promise<void> 
    on(event: RpcCommunicatorEvents.OUTGOING_MESSAGE, listener: (message: Uint8Array, callContext?: CallContext) => void): this
}

interface OngoingRequest {
    deferredPromises: DeferredPromises,
    timeoutRef: NodeJS.Timeout
}

const logger = new Logger(module)

export class RpcCommunicator extends EventEmitter implements IRpcIo {
    private stopped = false
    private static objectCounter = 0
    private objectId = 0
    private readonly rpcClientTransport: ClientTransport
    private readonly rpcServerTransport: ServerTransport
    private readonly ongoingRequests: Map<string, OngoingRequest>
    private defaultRpcRequestTimeout = 5000 

    constructor(params?: RpcCommunicatorConfig) {
        super()
        this.objectId = RpcCommunicator.objectCounter
        RpcCommunicator.objectCounter++

        if (params && params.hasOwnProperty('rpcRequestTimeout')) {
            this.defaultRpcRequestTimeout = params.rpcRequestTimeout!
        }
        
        this.rpcClientTransport = new ClientTransport(this.defaultRpcRequestTimeout)
        this.rpcServerTransport = new ServerTransport()
        this.ongoingRequests = new Map()
        
        this.rpcClientTransport.on(DhtTransportClientEvent.RPC_REQUEST, (
            deferredPromises: DeferredPromises,
            rpcMessage: RpcMessage,
            options: ProtoRpcOptions
        ) => {
            this.onOutgoingMessage(rpcMessage, deferredPromises, options as CallContext)
        })
        this.rpcServerTransport.on(DhtTransportServerEvent.RPC_RESPONSE, (rpcMessage: RpcMessage) => {
            this.onOutgoingMessage(rpcMessage)
        })
    }

    public async handleIncomingMessage(message: Uint8Array, callContext?: CallContext): Promise<void> {
        const rpcCall = RpcMessage.fromBinary(message)
        return this.onIncomingMessage(rpcCall, callContext)
    }

    public onOutgoingMessage(rpcMessage: RpcMessage, deferredPromises?: DeferredPromises, callContext?: CallContext): void {
        if (this.stopped) {
            return
        }
        const requestOptions = this.rpcClientTransport.mergeOptions(callContext )
        if (deferredPromises && rpcMessage.header.notification) {
            this.resolveDeferredPromises(deferredPromises, this.notificationResponse(rpcMessage.requestId))
        } else if (deferredPromises) {
            this.registerRequest(rpcMessage.requestId, deferredPromises, requestOptions!.timeout as number)
        }
        const msg = RpcMessage.toBinary(rpcMessage)

        logger.trace(`onOutGoingMessage, messageId: ${rpcMessage.requestId}`)
        
        this.emit(RpcCommunicatorEvents.OUTGOING_MESSAGE, msg, callContext)
    }

    private async onIncomingMessage(rpcMessage: RpcMessage, 
        callContext?: CallContext): Promise<void> {
        if (this.stopped) {
            return
        }
        logger.trace(`onIncomingMessage, requestId: ${rpcMessage.requestId}`)
        
        if (rpcMessage.header.response && this.ongoingRequests.has(rpcMessage.requestId)) {
            if (rpcMessage.responseError !== undefined) {
                this.rejectOngoingRequest(rpcMessage)
            } else {
                this.resolveOngoingRequest(rpcMessage)
            }
        } else if (rpcMessage.header.request && rpcMessage.header.method) {
            if (rpcMessage.header.notification) {
                await this.handleNotification(rpcMessage, callContext)
            } else {
                await this.handleRequest(rpcMessage, callContext)
            }
        }
    }

    public getRpcClientTransport(): ClientTransport {
        return this.rpcClientTransport
    }

    public registerRpcMethod<RequestClass extends Parser<RequestType>, ReturnClass extends Serializer<ReturnType>, RequestType, ReturnType>
    (requestClass: RequestClass, returnClass: ReturnClass,
        name: string, fn: (rq: RequestType, _context: ServerCallContext) => Promise<ReturnType>): void {
        this.rpcServerTransport.registerRpcMethod(requestClass, returnClass, name, fn)
    }

    public registerRpcNotification<RequestClass extends Parser<RequestType>, RequestType >(
        requestClass: RequestClass,
        name: string,
        fn: (rq: RequestType, _context: ServerCallContext) => Promise<NotificationResponse>
    ): void {
        this.rpcServerTransport.registerRpcNotification(requestClass, name, fn)
    }

    private async handleRequest(rpcMessage: RpcMessage, callContext?: CallContext): Promise<void> {
        if (this.stopped) {
            return
        }
        let response: RpcMessage
        try {
            const bytes = await this.rpcServerTransport.onRequest(rpcMessage, callContext)
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
        this.onOutgoingMessage(response, undefined, callContext)
    }

    private async handleNotification(rpcMessage: RpcMessage, 
        callContext?: CallContext): Promise<void> {
        if (this.stopped) {
            return
        }
        try {
            await this.rpcServerTransport.onNotification(rpcMessage, callContext)
        } catch (err) { }
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
            deferredPromises.status.reject({ code, detail: error.message })
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
            responseError
        }
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
        this.ongoingRequests.clear()
        this.rpcClientTransport.stop()
        this.rpcServerTransport.stop()
    }
}
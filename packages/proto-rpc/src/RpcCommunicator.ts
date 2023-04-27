import * as Err from './errors'
import { ErrorCode } from './errors'
import {
    ClientTransport,
    ResultParts
} from './ClientTransport'
import {
    RpcMessage,
    RpcResponseError
} from './proto/ProtoRpc'
import { Empty } from './proto/google/protobuf/empty'
import { Parser, Serializer, ServerRegistry } from './ServerRegistry'
import EventEmitter from 'eventemitter3'
import { DeferredState } from '@protobuf-ts/runtime-rpc'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { Logger } from '@streamr/utils'
import { ProtoCallContext, ProtoRpcOptions } from './ProtoCallContext'

export enum StatusCode {
    OK = 'OK',
    STOPPED = 'STOPPED',
    DEADLINE_EXCEEDED = 'DEADLINE_EXCEEDED',
    SERVER_ERROR = 'SERVER_ERROR'
}

interface RpcCommunicatorEvents {
    outgoingMessage: (message: Uint8Array, callContext?: ProtoCallContext) => void
}

export interface RpcCommunicatorConfig {
    rpcRequestTimeout?: number
}

interface IRpcIo {
    handleIncomingMessage(message: Uint8Array, callContext?: ProtoCallContext): Promise<void>
}

class OngoingRequest {

    private deferredPromises: ResultParts
    private timeoutRef: NodeJS.Timeout

    constructor(deferredPromises: ResultParts,
        timeout: number) {
        this.deferredPromises = deferredPromises
        this.timeoutRef = setTimeout(() => {
            const error = new Err.RpcTimeout('Rpc request timed out', new Error())
            this.rejectDeferredPromises(error, StatusCode.DEADLINE_EXCEEDED)
        }, timeout)
    }

    public resolveRequest(response: RpcMessage) {
        if (this.timeoutRef) {
            clearTimeout(this.timeoutRef)
        }
        this.resolveDeferredPromises(response)
    }

    public rejectRequest(error: Error, code: string) {
        if (this.timeoutRef) {
            clearTimeout(this.timeoutRef)
        }
        this.rejectDeferredPromises(error, code)
    }

    private resolveDeferredPromises(response: RpcMessage): void {
        if (this.deferredPromises.message.state === DeferredState.PENDING) {
            const parsedResponse = this.deferredPromises.messageParser(response.body)
            this.deferredPromises.message.resolve(parsedResponse)
            this.deferredPromises.header.resolve({})
            this.deferredPromises.status.resolve({ code: StatusCode.OK, detail: '' })
            this.deferredPromises.trailer.resolve({})
        }
    }

    private rejectDeferredPromises(error: Error, code: string): void {
        if (this.deferredPromises.message.state === DeferredState.PENDING) {
            this.deferredPromises.message.reject(error)
            this.deferredPromises.header.reject(error)
            this.deferredPromises.status.reject({ code, detail: error.message })
            this.deferredPromises.trailer.reject(error)
        }
    }
}

const logger = new Logger(module)

export class RpcCommunicator extends EventEmitter<RpcCommunicatorEvents> implements IRpcIo {
    private stopped = false
    private readonly rpcClientTransport: ClientTransport
    private readonly rpcServerRegistry: ServerRegistry
    private readonly ongoingRequests: Map<string, OngoingRequest>
    private readonly rpcRequestTimeout: number

    constructor(params?: RpcCommunicatorConfig) {
        super()

        this.rpcRequestTimeout = params?.rpcRequestTimeout ?? 5000
        this.rpcClientTransport = new ClientTransport(this.rpcRequestTimeout)
        this.rpcServerRegistry = new ServerRegistry()
        this.ongoingRequests = new Map()

        this.rpcClientTransport.on('rpcRequest', (
            rpcMessage: RpcMessage,
            options: ProtoRpcOptions,
            deferredPromises: ResultParts | undefined
        ) => {
            this.onOutgoingMessage(rpcMessage, deferredPromises, options as ProtoCallContext)
        })
        this.rpcServerRegistry.on('rpcResponse', (rpcMessage: RpcMessage) => {
            this.onOutgoingMessage(rpcMessage)
        })
    }

    public async handleIncomingMessage(message: Uint8Array, callContext?: ProtoCallContext): Promise<void> {
        if (this.stopped) {
            return
        }
        const rpcCall = RpcMessage.fromBinary(message)
        return this.onIncomingMessage(rpcCall, callContext)
    }

    public registerRpcMethod<RequestClass extends Parser<RequestType>, ReturnClass extends Serializer<ReturnType>, RequestType, ReturnType>(
        requestClass: RequestClass,
        returnClass: ReturnClass,
        name: string,
        fn: (rq: RequestType, _context: ServerCallContext) => Promise<ReturnType>
    ): void {
        this.rpcServerRegistry.registerRpcMethod(requestClass, returnClass, name, fn)
    }

    public registerRpcNotification<RequestClass extends Parser<RequestType>, RequestType>(
        requestClass: RequestClass,
        name: string,
        fn: (rq: RequestType, _context: ServerCallContext) => Promise<Empty>
    ): void {
        this.rpcServerRegistry.registerRpcNotification(requestClass, name, fn)
    }

    public getRpcClientTransport(): ClientTransport {
        return this.rpcClientTransport
    }

    public stop(): void {
        this.stopped = true
        this.ongoingRequests.forEach((ongoingRequest: OngoingRequest) => {
            ongoingRequest.rejectRequest(new Error('stopped'), StatusCode.STOPPED)
        })
        this.removeAllListeners()
        this.ongoingRequests.clear()
        this.rpcClientTransport.stop()
    }

    private onOutgoingMessage(rpcMessage: RpcMessage, deferredPromises?: ResultParts, callContext?: ProtoCallContext): void {
        if (this.stopped) {
            return
        }
        const requestOptions = this.rpcClientTransport.mergeOptions(callContext)
        if (deferredPromises) {
            this.registerRequest(rpcMessage.requestId, deferredPromises, requestOptions!.timeout as number)
        }
        const msg = RpcMessage.toBinary(rpcMessage)

        logger.trace(`onOutGoingMessage, messageId: ${rpcMessage.requestId}`)

        this.emit('outgoingMessage', msg, callContext)
    }

    private async onIncomingMessage(rpcMessage: RpcMessage, callContext?: ProtoCallContext): Promise<void> {
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

    private async handleRequest(rpcMessage: RpcMessage, callContext?: ProtoCallContext): Promise<void> {
        if (this.stopped) {
            return
        }
        let response: RpcMessage
        try {
            const bytes = await this.rpcServerRegistry.handleRequest(rpcMessage, callContext)
            response = this.createResponseRpcMessage({
                request: rpcMessage,
                body: bytes
            })
        } catch (err) {
            let responseError
            if (err.code === ErrorCode.UNKNOWN_RPC_METHOD) {
                responseError = RpcResponseError.UNKNOWN_RPC_METHOD
            } else if (err.code === ErrorCode.RPC_TIMEOUT) {
                responseError = RpcResponseError.SERVER_TIMOUT
            } else {
                responseError = RpcResponseError.SERVER_ERROR
            }
            response = this.createResponseRpcMessage({
                request: rpcMessage,
                responseError
            })
        }
        this.onOutgoingMessage(response, undefined, callContext)
    }

    private async handleNotification(rpcMessage: RpcMessage,
        callContext?: ProtoCallContext): Promise<void> {
        if (this.stopped) {
            return
        }
        try {
            await this.rpcServerRegistry.handleNotification(rpcMessage, callContext)
        } catch (err) {
            logger.debug('error', { err })
        }
    }

    private registerRequest(requestId: string, deferredPromises: ResultParts, timeout = this.rpcRequestTimeout): void {
        if (this.stopped) {
            return
        }

        const ongoingRequest = new OngoingRequest(deferredPromises, timeout)

        this.ongoingRequests.set(requestId, ongoingRequest)
    }

    private resolveOngoingRequest(response: RpcMessage): void {
        if (this.stopped) {
            return
        }
        const ongoingRequest = this.ongoingRequests.get(response.requestId)!
        ongoingRequest.resolveRequest(response)

        this.ongoingRequests.delete(response.requestId)
    }

    private rejectOngoingRequest(response: RpcMessage): void {
        if (this.stopped) {
            return
        }
        const ongoingRequest = this.ongoingRequests.get(response.requestId)!

        let error
        if (response.responseError === RpcResponseError.SERVER_TIMOUT) {
            error = new Err.RpcTimeout('Server timed out on request')
        } else if (response.responseError === RpcResponseError.UNKNOWN_RPC_METHOD) {
            error = new Err.RpcRequest(`Server does not implement method ${response.header.method}`)
        } else {
            error = new Err.RpcRequest('Server error on request')
        }
        ongoingRequest.rejectRequest(error, StatusCode.SERVER_ERROR)
        this.ongoingRequests.delete(response.requestId)
    }

    // eslint-disable-next-line class-methods-use-this
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
}

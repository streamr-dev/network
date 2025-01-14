/* eslint-disable promise/catch-or-return */

import * as Err from './errors'
import { ErrorCode } from './errors'
import { ClientTransport, ResultParts } from './ClientTransport'
import { RpcMessage, RpcErrorType } from '../generated/ProtoRpc'
import { Empty } from '../generated/google/protobuf/empty'
import { MethodOptions, ServerRegistry } from './ServerRegistry'
import { DeferredState, ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { Logger } from '@streamr/utils'
import { ProtoCallContext, ProtoRpcOptions } from './ProtoCallContext'
import { Any } from '../generated/google/protobuf/any'
import { IMessageType } from '@protobuf-ts/runtime'

export enum StatusCode {
    OK = 'OK',
    STOPPED = 'STOPPED',
    DEADLINE_EXCEEDED = 'DEADLINE_EXCEEDED',
    SERVER_ERROR = 'SERVER_ERROR'
}

export interface RpcCommunicatorOptions {
    rpcRequestTimeout?: number
}

class OngoingRequest<T extends ProtoCallContext> {
    private deferredPromises: ResultParts
    private callContext: T
    private timeoutRef?: NodeJS.Timeout

    constructor(
        deferredPromises: ResultParts,
        callContext: T,
        timeoutOptions?: { timeout: number; onTimeout: () => void }
    ) {
        this.deferredPromises = deferredPromises
        this.callContext = callContext
        if (timeoutOptions) {
            this.timeoutRef = setTimeout(() => {
                const error = new Err.RpcTimeout('Rpc request timed out', new Error())
                this.rejectDeferredPromises(error, StatusCode.DEADLINE_EXCEEDED)
                timeoutOptions.onTimeout()
            }, timeoutOptions.timeout)
        }
    }

    public resolveRequest(response: RpcMessage) {
        if (this.timeoutRef) {
            clearTimeout(this.timeoutRef)
        }
        this.resolveDeferredPromises(response)
    }

    public resolveNotification() {
        if (this.timeoutRef) {
            clearTimeout(this.timeoutRef)
        }
        if (this.deferredPromises.message.state === DeferredState.PENDING) {
            this.deferredPromises.message.resolve({})
            this.deferredPromises.header.resolve({})
            this.deferredPromises.status.resolve({ code: StatusCode.OK, detail: '' })
            this.deferredPromises.trailer.resolve({})
        }
    }

    public rejectRequest(error: Error, code: string) {
        if (this.timeoutRef) {
            clearTimeout(this.timeoutRef)
        }
        this.rejectDeferredPromises(error, code)
    }

    private resolveDeferredPromises(response: RpcMessage): void {
        if (this.deferredPromises.message.state === DeferredState.PENDING) {
            try {
                const parsedResponse = this.deferredPromises.messageParser(response.body!.value)
                this.deferredPromises.message.resolve(parsedResponse)
                this.deferredPromises.header.resolve({})
                this.deferredPromises.status.resolve({ code: StatusCode.OK, detail: '' })
                this.deferredPromises.trailer.resolve({})
            } catch (err) {
                logger.debug(`Could not parse response, received message is likely `)
                const error = new Err.FailedToParse(
                    `Failed to parse received response, network protocol version likely is likely incompatible`,
                    err
                )
                this.rejectDeferredPromises(error, StatusCode.SERVER_ERROR)
            }
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

    fulfillsPredicate(predicate: (request: OngoingRequest<T>) => boolean): boolean {
        return predicate(this)
    }

    getCallContext(): T {
        return this.callContext
    }
}

const logger = new Logger(module)

interface RpcResponseParams {
    request: RpcMessage
    body?: Any
    errorType?: RpcErrorType
    errorClassName?: string
    errorCode?: string
    errorMessage?: string
}

type OutgoingMessageListener<T extends ProtoCallContext> = (
    message: RpcMessage,
    requestId: string,
    callContext: T
) => Promise<void>

export class RpcCommunicator<T extends ProtoCallContext> {
    private stopped = false
    private readonly rpcClientTransport: ClientTransport
    private readonly rpcServerRegistry: ServerRegistry
    private readonly ongoingRequests: Map<string, OngoingRequest<T>>
    private readonly rpcRequestTimeout: number
    private outgoingMessageListener?: OutgoingMessageListener<T>

    constructor(params?: RpcCommunicatorOptions) {
        this.rpcRequestTimeout = params?.rpcRequestTimeout ?? 5000
        this.rpcClientTransport = new ClientTransport(this.rpcRequestTimeout)
        this.rpcServerRegistry = new ServerRegistry()
        this.ongoingRequests = new Map()

        // Client side listener for outgoing request
        this.rpcClientTransport.on(
            'rpcRequest',
            (rpcMessage: RpcMessage, options: ProtoRpcOptions, deferredPromises: ResultParts | undefined) => {
                this.onOutgoingMessage(rpcMessage, options as T, deferredPromises)
            }
        )
    }

    public async handleIncomingMessage(message: RpcMessage, callContext: T): Promise<void> {
        if (this.stopped) {
            return
        }
        return this.onIncomingMessage(message, callContext)
    }

    public registerRpcMethod<
        RequestClass extends IMessageType<RequestType>,
        ReturnClass extends IMessageType<ReturnType>,
        RequestType extends object,
        ReturnType extends object
    >(
        requestClass: RequestClass,
        returnClass: ReturnClass,
        name: string,
        fn: (rq: RequestType, _context: ServerCallContext) => Promise<ReturnType>,
        options: MethodOptions = {}
    ): void {
        this.rpcServerRegistry.registerRpcMethod(requestClass, returnClass, name, fn, options)
    }

    public registerRpcNotification<RequestClass extends IMessageType<RequestType>, RequestType extends object>(
        requestClass: RequestClass,
        name: string,
        fn: (rq: RequestType, _context: ServerCallContext) => Promise<Empty>,
        options: MethodOptions = {}
    ): void {
        this.rpcServerRegistry.registerRpcNotification(requestClass, name, fn, options)
    }

    public getRpcClientTransport(): ClientTransport {
        return this.rpcClientTransport
    }

    public stop(): void {
        this.stopped = true
        this.ongoingRequests.forEach((ongoingRequest: OngoingRequest<T>) => {
            ongoingRequest.rejectRequest(new Error('stopped'), StatusCode.STOPPED)
        })
        this.ongoingRequests.clear()
        this.rpcClientTransport.stop()
    }

    private onOutgoingMessage(rpcMessage: RpcMessage, callContext: T, deferredPromises?: ResultParts): void {
        if (this.stopped) {
            if (deferredPromises) {
                const ongoingRequest = new OngoingRequest(deferredPromises, callContext)
                ongoingRequest.rejectRequest(new Error('stopped'), StatusCode.STOPPED)
            }
            return
        }
        const requestOptions = this.rpcClientTransport.mergeOptions(callContext)

        // do not register a notification
        if (deferredPromises && (!callContext || !callContext.notification)) {
            this.registerRequest(rpcMessage.requestId, deferredPromises, callContext, requestOptions.timeout as number)
        }

        logger.trace(`onOutGoingMessage, messageId: ${rpcMessage.requestId}`)

        if (this.outgoingMessageListener) {
            this.outgoingMessageListener(rpcMessage, rpcMessage.requestId, callContext)
                .catch((clientSideException) => {
                    if (deferredPromises) {
                        if (this.ongoingRequests.has(rpcMessage.requestId)) {
                            this.handleClientError(rpcMessage.requestId, clientSideException)
                        } else {
                            const ongoingRequest = new OngoingRequest(deferredPromises, callContext)
                            ongoingRequest.rejectRequest(clientSideException, StatusCode.SERVER_ERROR)
                        }
                    }
                })
                .then(() => {
                    if (deferredPromises) {
                        if (!this.ongoingRequests.has(rpcMessage.requestId)) {
                            const ongoingRequest = new OngoingRequest(deferredPromises, callContext)
                            ongoingRequest.resolveNotification()
                        }
                    }
                })
        } else if (deferredPromises) {
            if (!this.ongoingRequests.has(rpcMessage.requestId)) {
                const ongoingRequest = new OngoingRequest(deferredPromises, callContext)
                ongoingRequest.resolveNotification()
            }
        }
    }

    private async onIncomingMessage(rpcMessage: RpcMessage, callContext: T): Promise<void> {
        logger.trace(`onIncomingMessage, requestId: ${rpcMessage.requestId}`)

        if (rpcMessage.header.response && this.ongoingRequests.has(rpcMessage.requestId)) {
            if (rpcMessage.errorType !== undefined) {
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

    private async handleRequest(rpcMessage: RpcMessage, callContext: T): Promise<void> {
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
            const errorParams: RpcResponseParams = { request: rpcMessage }
            if (err.code === ErrorCode.UNKNOWN_RPC_METHOD) {
                errorParams.errorType = RpcErrorType.UNKNOWN_RPC_METHOD
            } else if (err.code === ErrorCode.RPC_TIMEOUT) {
                errorParams.errorType = RpcErrorType.SERVER_TIMEOUT
            } else {
                errorParams.errorType = RpcErrorType.SERVER_ERROR
                if (err.className) {
                    errorParams.errorClassName = err.className
                }
                if (err.code) {
                    errorParams.errorCode = err.code
                }
                if (err.message) {
                    errorParams.errorMessage = err.message
                }
            }
            response = this.createResponseRpcMessage(errorParams)
        }
        this.onOutgoingMessage(response, callContext, undefined)
    }

    private async handleNotification(rpcMessage: RpcMessage, callContext: T): Promise<void> {
        if (this.stopped) {
            return
        }
        try {
            await this.rpcServerRegistry.handleNotification(rpcMessage, callContext)
        } catch (err) {
            logger.debug('error', { err })
        }
    }

    private registerRequest(
        requestId: string,
        deferredPromises: ResultParts,
        callContext: T,
        timeout = this.rpcRequestTimeout
    ): void {
        if (this.stopped) {
            return
        }

        const ongoingRequest = new OngoingRequest(deferredPromises, callContext, {
            timeout,
            onTimeout: () => this.ongoingRequests.delete(requestId)
        })

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
        if (response.errorType === RpcErrorType.SERVER_TIMEOUT) {
            error = new Err.RpcTimeout('Server timed out on request')
        } else if (response.errorType === RpcErrorType.UNKNOWN_RPC_METHOD) {
            error = new Err.UnknownRpcMethod(`Server does not implement method ${response.header.method}`)
        } else if (response.errorType === RpcErrorType.SERVER_ERROR) {
            error = new Err.RpcServerError(response.errorMessage, response.errorClassName, response.errorCode)
        } else {
            error = new Err.RpcRequest('Unknown RPC Error')
        }
        ongoingRequest.rejectRequest(error, StatusCode.SERVER_ERROR)
        this.ongoingRequests.delete(response.requestId)
    }

    public handleClientError(requestId: string, error: Error): void {
        if (this.stopped) {
            return
        }

        const ongoingRequest = this.ongoingRequests.get(requestId)

        if (ongoingRequest) {
            ongoingRequest.rejectRequest(error, StatusCode.SERVER_ERROR)
            this.ongoingRequests.delete(requestId)
        }
    }

    public setOutgoingMessageListener(listener: OutgoingMessageListener<T>): void {
        this.outgoingMessageListener = listener
    }

    public getRequestIds(predicate: (request: OngoingRequest<T>) => boolean): string[] {
        return Array.from(this.ongoingRequests.entries())
            .filter(([_, request]) => request.fulfillsPredicate(predicate))
            .map(([id]) => id)
    }

    // eslint-disable-next-line class-methods-use-this
    private createResponseRpcMessage({
        request,
        body,
        errorType,
        errorClassName,
        errorCode,
        errorMessage
    }: RpcResponseParams): RpcMessage {
        return {
            body,
            header: {
                response: 'response',
                method: request.header.method
            },
            requestId: request.requestId,
            errorType,
            errorClassName,
            errorCode,
            errorMessage
        }
    }
}

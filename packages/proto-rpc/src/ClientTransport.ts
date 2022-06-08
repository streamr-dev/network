import {
    ClientStreamingCall,
    ServerStreamingCall,
    DuplexStreamingCall,
    Deferred,
    RpcTransport,
    MethodInfo,
    RpcError,
    RpcOptions,
    RpcMetadata,
    RpcStatus,
    UnaryCall,
    mergeRpcOptions
} from '@protobuf-ts/runtime-rpc'
import { v4 } from 'uuid'
import { TODO } from './types'
import { RpcMessage } from './proto/ProtoRpc'
import EventEmitter = require('events')
import { Logger } from './Logger'

export enum Event {
    RPC_REQUEST = 'streamr:dht-transport:request-new'
}

export interface ClientTransport {
    on(event: Event.RPC_REQUEST, listener: (deferredPromises: DeferredPromises, rpcMessage: RpcMessage, options: ProtoRpcOptions) => void): this
}

export interface DeferredPromises {
    header: Deferred<RpcMetadata>,
    message: Deferred<object>,
    status: Deferred<RpcStatus>,
    trailer: Deferred<RpcMetadata>,
    messageParser: (bytes: Uint8Array) => object
}

/*
export interface DhtRpcOptions extends RpcOptions {
    targetDescriptor?: PeerDescriptor
    sourceDescriptor?: PeerDescriptor
    notification?: boolean
    clientId?: number
}
*/

export interface ProtoRpcOptions extends RpcOptions {
    notification?: boolean
}

const logger = new Logger(module)

export class ClientTransport extends EventEmitter implements RpcTransport {
    static objectCount = 0
    private objectId = 1
    private stopped = false
    protected readonly defaultOptions: TODO

    constructor(defaultTimeout?: number) {
        super()
        this.objectId = ClientTransport.objectCount
        ClientTransport.objectCount++
        
        this.defaultOptions = {
            timeout: defaultTimeout || 5000,
            clientId: this.objectId
        }
    }

    mergeOptions(options?: Partial<ProtoRpcOptions>): RpcOptions {
        return mergeRpcOptions(this.defaultOptions, options)
    }

    createRequestHeaders(method: MethodInfo, notification?: boolean): any {
        return {
            method: method.localName,
            request: 'request',
            notification: notification ? 'notification' : undefined
        }
    }

    unary<I extends object, O extends object>(method: MethodInfo<I, O>, input: I, options: ProtoRpcOptions): UnaryCall<I, O> {
        const
            requestBody = method.I.toBinary(input),
            defHeader = new Deferred<RpcMetadata>(),
            defMessage = new Deferred<O>(),
            defStatus = new Deferred<RpcStatus>(),
            defTrailer = new Deferred<RpcMetadata>()

        const request: RpcMessage = {
            header: this.createRequestHeaders(method, options.notification),
            body: requestBody,
            requestId: v4()
        }

        const unary = new UnaryCall<I, O>(
            method,
            {},
            input,
            defHeader.promise,
            defMessage.promise,
            defStatus.promise,
            defTrailer.promise,
        )

        if (this.stopped) {
            return unary
        }

        const deferredParser = (bytes: Uint8Array) => method.O.fromBinary(bytes)
        const deferred: DeferredPromises = {
            message: defMessage,
            header: defHeader,
            trailer: defTrailer,
            status: defStatus,
            messageParser: deferredParser
        }
        logger.trace(`New rpc ${options.notification ? 'notification' : 'request'}, ${request.requestId}`)
        this.emit(Event.RPC_REQUEST, deferred, request, options)
        return unary
    }

    clientStreaming<I extends object, O extends object>(method: MethodInfo<I, O>/*, options: RpcOptions*/): ClientStreamingCall<I, O> {
        const e = new RpcError('Client streaming is not supported by DhtTransport')
        e.methodName = method.name
        e.serviceName  = method.service.typeName
        throw e
    }

    duplex<I extends object, O extends object>(method: MethodInfo<I, O>/*, options: RpcOptions*/): DuplexStreamingCall<I, O> {
        const e = new RpcError('Duplex streaming is not supported by DhtTransport')
        e.methodName = method.name
        e.serviceName  = method.service.typeName
        throw e
    }

    serverStreaming<I extends object, O extends object>(method: MethodInfo<I, O>/*, input: I, options?: RpcOptions*/): ServerStreamingCall<I, O> {
        const e = new RpcError('Server streaming is not supported by DhtTransport')
        e.methodName = method.name
        e.serviceName  = method.service.typeName
        throw e
    }

    stop(): void {
        this.stopped = true
        this.removeAllListeners()
    }
}
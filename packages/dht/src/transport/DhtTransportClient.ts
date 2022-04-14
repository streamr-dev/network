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
import { TODO } from '../types'
import { AbstractTransport } from './AbstractTransport'
import { RpcWrapper } from '../proto/DhtRpc'
import EventEmitter = require('events')

export enum Event {
    RPC_REQUEST = 'streamr:dht-transport:request-new'
}

export interface DhtTransportClient {
    on(event: Event.RPC_REQUEST, listener: (unary: UnaryCall<object, object>, rpcWrapper: RpcWrapper) => void): this
}

export class DhtTransportClient extends EventEmitter implements RpcTransport {
    protected readonly defaultOptions: TODO
    protected readonly transport: AbstractTransport

    constructor(transport: AbstractTransport) {
        super()
        this.transport = transport
        this.defaultOptions = {}
    }

    mergeOptions(options?: Partial<RpcOptions>): RpcOptions {
        return mergeRpcOptions(this.defaultOptions, options)
    }

    createRequestHeaders(method: MethodInfo): any {
        return {
            method: method.service.typeName
        }
    }

    unary<I extends object, O extends object>(method: MethodInfo<I, O>, input: I, _options: RpcOptions): UnaryCall<I, O> {
        const
            requestBody = method.I.toBinary(input),
            defHeader = new Deferred<RpcMetadata>(),
            defMessage = new Deferred<O>(),
            defStatus = new Deferred<RpcStatus>(),
            defTrailer = new Deferred<RpcMetadata>()

        const request: RpcWrapper = {
            header: this.createRequestHeaders(method),
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
        this.emit(Event.RPC_REQUEST, unary, request)

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
}
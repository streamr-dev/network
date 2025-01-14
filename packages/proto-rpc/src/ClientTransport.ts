import {
    ClientStreamingCall,
    ServerStreamingCall,
    DuplexStreamingCall,
    Deferred,
    RpcTransport,
    MethodInfo,
    RpcError,
    RpcMetadata,
    RpcStatus,
    UnaryCall,
    mergeRpcOptions
} from '@protobuf-ts/runtime-rpc'
import { v4 } from 'uuid'
import { RpcMessage } from '../generated/ProtoRpc'
import EventEmitter from 'eventemitter3'
import { Logger } from '@streamr/utils'
import { ProtoRpcOptions } from './ProtoCallContext'
import { Any } from '../generated/google/protobuf/any'

interface ClientTransportEvents {
    rpcRequest: (rpcMessage: RpcMessage, options: ProtoRpcOptions, results?: ResultParts) => void
}

export interface ResultParts {
    header: Deferred<RpcMetadata>
    message: Deferred<object>
    status: Deferred<RpcStatus>
    trailer: Deferred<RpcMetadata>
    messageParser: (bytes: Uint8Array) => object
}

const logger = new Logger(module)

export class ClientTransport extends EventEmitter<ClientTransportEvents> implements RpcTransport {
    private static objectCount = 0
    private readonly objectId: number
    protected readonly defaultOptions: ProtoRpcOptions

    constructor(defaultTimeout = 5000) {
        super()
        this.objectId = ClientTransport.objectCount++
        this.defaultOptions = {
            timeout: defaultTimeout,
            clientId: this.objectId
        }
    }

    mergeOptions(options?: Partial<ProtoRpcOptions>): ProtoRpcOptions {
        return mergeRpcOptions(this.defaultOptions, options)
    }

    private static createRequestHeaders(
        method: MethodInfo,
        notification?: boolean
    ): {
        method: string
        request: string
        notification?: string
    } {
        return {
            method: method.localName,
            request: 'request',
            notification: notification ? 'notification' : undefined
        }
    }

    unary<I extends object, O extends object>(
        method: MethodInfo<I, O>,
        input: I,
        options: ProtoRpcOptions
    ): UnaryCall<I, O> {
        if (!options?.isProtoRpc) {
            throw new Error(
                // eslint-disable-next-line max-len
                'ProtoRpc ClientTransport can only be used with ProtoRpcClients. Please convert your protobuf-ts generated client to a ProtoRpcClient by calling toProtoRpcclient(yourClient).'
            )
        }
        const requestBody = Any.pack(input, method.I)

        const request: RpcMessage = {
            header: ClientTransport.createRequestHeaders(method, options.notification),
            body: requestBody,
            requestId: v4()
        }

        const defHeader = new Deferred<RpcMetadata>()
        const defMessage = new Deferred<O>()
        const defStatus = new Deferred<RpcStatus>()
        const defTrailer = new Deferred<RpcMetadata>()

        const unary = new UnaryCall<I, O>(
            method,
            {},
            input,
            defHeader.promise,
            defMessage.promise,
            defStatus.promise,
            defTrailer.promise
        )

        const deferredParser = (bytes: Uint8Array) => method.O.fromBinary(bytes)
        const deferred: ResultParts = {
            message: defMessage,
            header: defHeader,
            trailer: defTrailer,
            status: defStatus,
            messageParser: deferredParser
        }
        logger.trace(`New rpc ${options.notification ? 'notification' : 'request'}, ${request.requestId}`)
        this.emit('rpcRequest', request, options, deferred)
        return unary
    }

    // eslint-disable-next-line class-methods-use-this
    clientStreaming<I extends object, O extends object>(method: MethodInfo<I, O>): ClientStreamingCall<I, O> {
        const e = new RpcError('Client streaming is not supported by DhtTransport')
        e.methodName = method.name
        e.serviceName = method.service.typeName
        throw e
    }

    // eslint-disable-next-line class-methods-use-this
    duplex<I extends object, O extends object>(method: MethodInfo<I, O>): DuplexStreamingCall<I, O> {
        const e = new RpcError('Duplex streaming is not supported by DhtTransport')
        e.methodName = method.name
        e.serviceName = method.service.typeName
        throw e
    }

    // eslint-disable-next-line class-methods-use-this
    serverStreaming<I extends object, O extends object>(method: MethodInfo<I, O>): ServerStreamingCall<I, O> {
        const e = new RpcError('Server streaming is not supported by DhtTransport')
        e.methodName = method.name
        e.serviceName = method.service.typeName
        throw e
    }

    stop(): void {
        this.removeAllListeners()
    }
}

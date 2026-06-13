import {
    ClientStreamingCall,
    ServerStreamingCall,
    DuplexStreamingCall,
    Deferred,
    RpcTransport,
    MethodInfo,
    RpcError,
    UnaryCall,
    mergeRpcOptions
} from '@protobuf-ts/runtime-rpc'
import { v4 } from 'uuid'
import { RpcMessage } from '../generated/ProtoRpc'
import { EventEmitter } from 'eventemitter3'
import { Logger } from '@streamr/utils'
import { ProtoRpcOptions } from './ProtoCallContext'
import { Any } from '../generated/google/protobuf/any'

interface ClientTransportEvents {
    rpcRequest: (rpcMessage: RpcMessage, options: ProtoRpcOptions, results: ResultParts) => void
    // setSendResult lets the communicator hand the send promise back to the
    // (fire-and-forget) caller; eventemitter3 invokes listeners synchronously,
    // so it is set before notification() returns.
    rpcNotification: (rpcMessage: RpcMessage, options: ProtoRpcOptions, setSendResult: (result: Promise<void>) => void) => void
}

// Only the response message is ever consumed by ProtoRpc clients (the
// protobuf-ts header/status/trailer deferreds were always dummies), so a
// request needs just one deferred + its parser.
export interface ResultParts {
    message: Deferred<object>
    messageParser: (bytes: Uint8Array) => object
}

const logger = new Logger('ClientTransport')

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

    private static createRequestHeaders(method: MethodInfo, notification?: boolean): {
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

    // ProtoRpc clients drive `request()` / `notification()` directly (via
    // toProtoRpcClient); this RpcTransport entry point is only reached by a raw
    // protobuf-ts client that was never wrapped — hence the guard.
    // eslint-disable-next-line class-methods-use-this
    unary<I extends object, O extends object>(_method: MethodInfo<I, O>, _input: I, _options: ProtoRpcOptions): UnaryCall<I, O> {
        // eslint-disable-next-line max-len
        throw new Error('ProtoRpc ClientTransport can only be used with ProtoRpcClients. Please convert your protobuf-ts generated client to a ProtoRpcClient by calling toProtoRpcclient(yourClient).')
    }

    // Direct request path: one response deferred, no UnaryCall / header /
    // status / trailer. Returns the response message promise.
    request<I extends object, O extends object>(method: MethodInfo<I, O>, input: I, options: ProtoRpcOptions): Promise<O> {
        const request: RpcMessage = {
            header: ClientTransport.createRequestHeaders(method, false),
            body: Any.pack(input, method.I),
            requestId: v4()
        }
        const message = new Deferred<O>()
        logger.trace(`New rpc request, ${request.requestId}`)
        this.emit('rpcRequest', request, options, {
            message: message as Deferred<object>,
            messageParser: (bytes: Uint8Array) => method.O.fromBinary(bytes)
        })
        return message.promise
    }

    // Direct notification path: fire-and-forget, no deferreds / OngoingRequest.
    // Returns the send promise so the caller still sees send success/failure.
    notification<I extends object>(method: MethodInfo<I, any>, input: I, options: ProtoRpcOptions): Promise<void> {
        const request: RpcMessage = {
            header: ClientTransport.createRequestHeaders(method, true),
            body: Any.pack(input, method.I),
            requestId: v4()
        }
        logger.trace(`New rpc notification, ${request.requestId}`)
        let sendResult: Promise<void> = Promise.resolve()
        this.emit('rpcNotification', request, options, (result) => { sendResult = result })
        return sendResult
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

import { RpcMessage } from './proto/ProtoRpc'
import EventEmitter = require('events')
import { MethodInfo, RpcMetadata, RpcStatus, ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { BinaryReadOptions, BinaryWriteOptions } from '@protobuf-ts/runtime'
import { promiseTimeout } from './common'
import * as Err from './errors'
import UnknownRpcMethod = Err.UnknownRpcMethod
import { Logger } from './Logger'
import { ProtoRpcOptions } from './ClientTransport'
import { Empty } from './proto/google/protobuf/empty'

export enum ServerRegistryEvent {
    RPC_RESPONSE = 'rpcResponse',
    RPC_REQUEST = 'rpcRequest',
}

export interface ServerRegistry {
    on(event: ServerRegistryEvent.RPC_RESPONSE, listener: (rpcMessage: RpcMessage) => void): this
    on(event: ServerRegistryEvent.RPC_REQUEST, listener: (rpcMessage: RpcMessage) => void): this
}

export interface Parser<Target> { fromBinary: (data: Uint8Array, options?: Partial<BinaryReadOptions>) => Target }
export interface Serializer<Target> { toBinary: (message: Target, options?: Partial<BinaryWriteOptions>) => Uint8Array }

type RegisteredMethod = (request: Uint8Array, callContext: CallContext) => Promise<Uint8Array>
type RegisteredNotification = (request: Uint8Array, callContext: CallContext) => Promise<Empty>

const logger = new Logger(module)

export class ConversionWrappers {

    static parseWrapper<T>(parseFn: () => T): T | never {
        try {
            return parseFn()
        } catch (err) {
            throw new Err.FailedToParse(`Could not parse binary to JSON-object`, err)
        }
    }

    static serializeWrapper(serializerFn: () => Uint8Array): Uint8Array | never {
        try {
            return serializerFn()
        } catch (err) {
            throw new Err.FailedToSerialize(`Could not serialize message to binary`, err)
        }
    }
}

export class ServerRegistry extends EventEmitter {
    methods: Map<string, RegisteredMethod | RegisteredNotification>
    private stopped = false
    constructor() {
        super()
        this.methods = new Map()
    }

    public async onRequest(rpcMessage: RpcMessage, callContext?: CallContext): Promise<Uint8Array> {
        if (this.stopped) {
            return new Uint8Array()
        }
        logger.trace(`Server processing request ${rpcMessage.requestId}`)
        const methodName = rpcMessage.header.method
        if (methodName === undefined) {
            throw new UnknownRpcMethod('Header "method" missing from RPC message')
        }
        const fn = this.methods.get(methodName) as RegisteredMethod
        if (!fn) {
            throw new UnknownRpcMethod(`RPC Method ${methodName} is not provided`)
        }

        return await promiseTimeout(1000, fn!(rpcMessage.body, callContext ? callContext : new CallContext()))
    }

    public async onNotification(rpcMessage: RpcMessage, callContext?: CallContext): Promise<Empty> {
        if (this.stopped) {
            return {} as Empty
        }
        logger.trace(`Server processing notification ${rpcMessage.requestId}`)
        const methodName = rpcMessage.header.method
        if (methodName === undefined) {
            throw new UnknownRpcMethod('Header "method" missing from RPC message')
        }
        const fn = this.methods.get(methodName) as RegisteredNotification
        if (!fn) {
            throw new UnknownRpcMethod(`RPC Method ${methodName} is not provided`)
        }
        return await promiseTimeout(1000, fn!(rpcMessage.body, callContext ? callContext : new CallContext()))
    }

    public registerRpcMethod<RequestClass extends Parser<RequestType>, ReturnClass extends Serializer<ReturnType>, RequestType, ReturnType>(
        requestClass: RequestClass,
        returnClass: ReturnClass,
        name: string,
        fn: (rq: RequestType, _context: CallContext) => Promise<ReturnType>
    ): void {
        this.methods.set(name, async (bytes: Uint8Array, callContext: CallContext) => {
            const request = ConversionWrappers.parseWrapper(() => requestClass.fromBinary(bytes))
            const response = await fn(request, callContext)
            return returnClass.toBinary(response)
        })
    }

    public registerRpcNotification<RequestClass extends Parser<RequestType>, RequestType>(
        requestClass: RequestClass,
        name: string,
        fn: (rq: RequestType, _context: CallContext) => Promise<Empty>
    ): void {
        this.methods.set(name, async (bytes: Uint8Array, callContext: CallContext): Promise<Empty> => {
            const request = ConversionWrappers.parseWrapper(() => requestClass.fromBinary(bytes))
            const response = await fn(request, callContext)
            return Empty.toBinary(response)
        })
    }

    public stop(): void {
        this.stopped = true
        this.methods.clear()
    }
}

export class CallContext implements ServerCallContext, ProtoRpcOptions {
    [extra: string]: unknown

    notification?: boolean
    method: MethodInfo<any, any> = {
        // @ts-expect-error TS2322
        I: undefined,
        // @ts-expect-error TS2322
        O: undefined,
        // @ts-expect-error TS2322
        service: undefined,
        name: '',
        localName: '',
        idempotency: undefined,
        serverStreaming: false,
        clientStreaming: false,
        options: {}
    }
    headers: Readonly<RpcMetadata> = {}
    deadline: Date = new Date()
    trailers: RpcMetadata = {}
    status: RpcStatus = {
        code: '',
        detail: ''
    }
    sendResponseHeaders(_data: RpcMetadata): void {
        throw new Err.NotImplemented('Method not implemented.')
    }
    cancelled = false
    onCancel(_cb: () => void): () => void {
        throw new Err.NotImplemented('Method not implemented.')
    }

    constructor() { }
}
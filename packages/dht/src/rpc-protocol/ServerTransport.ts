import { NotificationResponse, PeerDescriptor, RpcMessage } from '../proto/DhtRpc'
import EventEmitter = require('events')
import { MethodInfo, RpcMetadata, RpcStatus, ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { BinaryReadOptions, BinaryWriteOptions } from '@protobuf-ts/runtime'
import { promiseTimeout } from '../helpers/common'
import { Err } from '../helpers/errors'
import UnknownRpcMethod = Err.UnknownRpcMethod
import { Logger } from '../helpers/Logger'
import { parseWrapper } from './ConversionWrappers'

export enum Event {
    RPC_RESPONSE = 'streamr:dht-transport:server:response-new',
    RPC_REQUEST = 'streamr:dht-transport:server:request-new',
}

export interface ServerTransport {
    on(event: Event.RPC_RESPONSE, listener: (rpcMessage: RpcMessage) => void): this
    on(event: Event.RPC_REQUEST, listener: (rpcMessage: RpcMessage) => void): this
}

export interface Parser<Target> { fromBinary: (data: Uint8Array, options?: Partial<BinaryReadOptions>) => Target }
export interface Serializer<Target> { toBinary: (message: Target, options?: Partial<BinaryWriteOptions>) => Uint8Array }

export type RegisteredMethod = (request: Uint8Array) => Promise<Uint8Array>

const logger = new Logger(module)

export class ServerTransport extends EventEmitter {
    methods: Map<string, RegisteredMethod>
    private stopped = false
    constructor() {
        super()
        this.methods = new Map()
    }

    async onRequest(peerDescriptor: PeerDescriptor, rpcMessage: RpcMessage): Promise<Uint8Array> {
        if (this.stopped) {
            return new Uint8Array()
        }
        logger.trace(`Server processing request ${rpcMessage.requestId}`)
        const methodName = rpcMessage.header.method
        const fn = this.methods.get(methodName)
        if (!fn) {
            throw new UnknownRpcMethod(`RPC Method ${methodName} is not provided`)
        }
        return await promiseTimeout(1000, fn!(rpcMessage.body))
    }

    async onNotification(peerDescriptor: PeerDescriptor, rpcMessage: RpcMessage): Promise<void> {
        if (this.stopped) {
            return
        }
        logger.trace(`Server processing notification ${rpcMessage.requestId}`)
        const methodName = rpcMessage.header.method
        const fn = this.methods.get(methodName)
        if (!fn) {
            throw new UnknownRpcMethod(`RPC Method ${methodName} is not provided`)
        }
        await promiseTimeout(1000, fn!(rpcMessage.body))
    }

    removeMethod(name: string): void {
        this.methods.delete(name)
    }
    
    public registerRpcMethod<RequestClass extends Parser<RequestType>, ReturnClass extends Serializer<ReturnType>, RequestType, ReturnType>
    (requestClass: RequestClass, returnClass: ReturnClass,
        name: string, fn: (rq: RequestType, _context: ServerCallContext) => Promise<ReturnType>): void {

        this.methods.set(name, async (bytes: Uint8Array) => {
            const request = requestClass.fromBinary(bytes)
            const response = await fn(request, new DummyServerCallContext())
            return returnClass.toBinary(response)
        })
    }

    registerRpcNotification<RequestClass extends Parser<RequestType>, RequestType >(
        requestClass: RequestClass,
        name: string,
        fn: (rq: RequestType, _context: ServerCallContext) => Promise<NotificationResponse>
    ): void {
        this.methods.set(name, async (bytes: Uint8Array) => {
            const request = parseWrapper(() => requestClass.fromBinary(bytes))
            const response = await fn(request, new DummyServerCallContext())
            return NotificationResponse.toBinary(response)
        })
    }

    stop(): void {
        this.stopped = true
        this.methods.clear()
    }
}

export class DummyServerCallContext implements ServerCallContext {
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
    constructor() {}
}
import { RpcMessage } from '../generated/ProtoRpc'
import { BinaryReadOptions, BinaryWriteOptions, IMessageType } from '@protobuf-ts/runtime'
import { promiseTimeout } from './common'
import * as Err from './errors'
import UnknownRpcMethod = Err.UnknownRpcMethod
import { Empty } from '../generated/google/protobuf/empty'
import { Logger } from '@streamr/utils'
import { ProtoCallContext } from './ProtoCallContext'
import { Any } from '../generated/google/protobuf/any'

export interface Parser<Target> {
    fromBinary: (data: Uint8Array, options?: Partial<BinaryReadOptions>) => Target
}
export interface Serializer<Target> {
    toBinary: (message: Target, options?: Partial<BinaryWriteOptions>) => Uint8Array
}

const DEFAULT_TIMEOUT = 1000

const parseOptions = (options: MethodOptions): MethodOptions => {
    return {
        timeout: options.timeout ?? DEFAULT_TIMEOUT
    }
}

export interface MethodOptions {
    timeout?: number
}

interface RegisteredMethod {
    fn: (request: Any, callContext: ProtoCallContext) => Promise<Any>
    options: MethodOptions
}

interface RegisteredNotification {
    fn: (request: Any, callContext: ProtoCallContext) => Promise<void>
    options: MethodOptions
}

const logger = new Logger(module)

export function parseWrapper<T>(parseFn: () => T): T | never {
    try {
        return parseFn()
    } catch (err) {
        throw new Err.FailedToParse(`Could not parse binary to JSON-object`, err)
    }
}

export function serializeWrapper(serializerFn: () => Uint8Array): Uint8Array | never {
    try {
        return serializerFn()
    } catch (err) {
        throw new Err.FailedToSerialize(`Could not serialize message to binary`, err)
    }
}

export class ServerRegistry {
    private methods = new Map<string, RegisteredMethod>()
    private notifications = new Map<string, RegisteredNotification>()

    // eslint-disable-next-line class-methods-use-this
    private getImplementation<T extends RegisteredMethod | RegisteredNotification>(
        rpcMessage: RpcMessage,
        map: Map<string, T>
    ): T {
        if (!rpcMessage?.header?.method) {
            throw new UnknownRpcMethod('Header "method" missing from RPC message')
        }

        if (!map.has(rpcMessage.header.method)) {
            throw new UnknownRpcMethod(`RPC Method ${rpcMessage.header.method} is not provided`)
        }

        return map.get(rpcMessage.header.method)!
    }

    public async handleRequest(rpcMessage: RpcMessage, callContext?: ProtoCallContext): Promise<Any> {
        logger.trace(`Server processing RPC call ${rpcMessage.requestId}`)

        const implementation = this.getImplementation(rpcMessage, this.methods)
        const timeout = implementation.options.timeout!
        return await promiseTimeout(
            timeout,
            implementation.fn(rpcMessage.body!, callContext ? callContext : new ProtoCallContext())
        )
    }

    public async handleNotification(rpcMessage: RpcMessage, callContext?: ProtoCallContext): Promise<void> {
        logger.trace(`Server processing RPC notification ${rpcMessage.requestId}`)

        const implementation = this.getImplementation(rpcMessage, this.notifications)
        const timeout = implementation.options.timeout!
        await promiseTimeout(
            timeout,
            implementation.fn(rpcMessage.body!, callContext ? callContext : new ProtoCallContext())
        )
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
        fn: (rq: RequestType, _context: ProtoCallContext) => Promise<ReturnType>,
        opts: MethodOptions = {}
    ): void {
        const options = parseOptions(opts)
        const method = {
            fn: async (data: Any, callContext: ProtoCallContext) => {
                const request = parseWrapper(() => Any.unpack(data, requestClass))
                const response = await fn(request, callContext)
                return Any.pack(response, returnClass)
            },
            options
        }
        this.methods.set(name, method)
    }

    public registerRpcNotification<RequestClass extends IMessageType<RequestType>, RequestType extends object>(
        requestClass: RequestClass,
        name: string,
        fn: (rq: RequestType, _context: ProtoCallContext) => Promise<Empty>,
        opts: MethodOptions = {}
    ): void {
        const options = parseOptions(opts)
        const notification = {
            fn: async (data: Any, callContext: ProtoCallContext): Promise<void> => {
                const request = parseWrapper(() => Any.unpack(data, requestClass))
                await fn(request, callContext)
            },
            options
        }
        this.notifications.set(name, notification)
    }
}

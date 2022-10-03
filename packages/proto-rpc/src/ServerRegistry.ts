import { RpcMessage } from './proto/ProtoRpc'
import EventEmitter from 'eventemitter3'
import { BinaryReadOptions, BinaryWriteOptions } from '@protobuf-ts/runtime'
import { promiseTimeout } from './common'
import * as Err from './errors'
import UnknownRpcMethod = Err.UnknownRpcMethod
import { Empty } from './proto/google/protobuf/empty'
import { Logger } from '@streamr/utils'
import { ProtoCallContext } from './ProtoCallContext'

interface ServerRegistryEvents {
    rpcRequest: (rpcMessage: RpcMessage) => void
    rpcResponse: (rpcMessage: RpcMessage) => void
}

export interface Parser<Target> { fromBinary: (data: Uint8Array, options?: Partial<BinaryReadOptions>) => Target }
export interface Serializer<Target> { toBinary: (message: Target, options?: Partial<BinaryWriteOptions>) => Uint8Array }

type RegisteredMethod = (request: Uint8Array, callContext: ProtoCallContext) => Promise<Uint8Array>
type RegisteredNotification = (request: Uint8Array, callContext: ProtoCallContext) => Promise<void>

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

export class ServerRegistry extends EventEmitter<ServerRegistryEvents> {
    private methods = new Map<string, RegisteredMethod>()
    private notifications = new Map<string, RegisteredNotification>()

    private getImplementation<T extends RegisteredMethod | RegisteredNotification>(rpcMessage: RpcMessage, map: Map<string, T>): T {
        if (!rpcMessage || !rpcMessage.header || !rpcMessage.header.method) {
            throw new UnknownRpcMethod('Header "method" missing from RPC message')
        }

        if (!map.has(rpcMessage.header.method)) {
            throw new UnknownRpcMethod(`RPC Method ${rpcMessage.header.method} is not provided`)
        }

        return map.get(rpcMessage.header.method)!
    }

    public async handleRequest(rpcMessage: RpcMessage, callContext?: ProtoCallContext): Promise<Uint8Array> {

        logger.trace(`Server processing RPC call ${rpcMessage.requestId}`)

        const fn = this.getImplementation(rpcMessage, this.methods)
        return await promiseTimeout(1000, fn!(rpcMessage.body, callContext ? callContext : new ProtoCallContext()))
    }

    public async handleNotification(rpcMessage: RpcMessage, callContext?: ProtoCallContext): Promise<void> {
       
        logger.trace(`Server processing RPC notification ${rpcMessage.requestId}`)
        
        const fn = this.getImplementation(rpcMessage, this.notifications)
        await promiseTimeout(1000, fn!(rpcMessage.body, callContext ? callContext : new ProtoCallContext()))
    }

    public registerRpcMethod<RequestClass extends Parser<RequestType>, ReturnClass extends Serializer<ReturnType>, RequestType, ReturnType>(
        requestClass: RequestClass,
        returnClass: ReturnClass,
        name: string,
        fn: (rq: RequestType, _context: ProtoCallContext) => Promise<ReturnType>
    ): void {
        this.methods.set(name, async (bytes: Uint8Array, callContext: ProtoCallContext) => {
            const request = parseWrapper(() => requestClass.fromBinary(bytes))
            const response = await fn(request, callContext)
            return returnClass.toBinary(response)
        })
    }

    public registerRpcNotification<RequestClass extends Parser<RequestType>, RequestType>(
        requestClass: RequestClass,
        name: string,
        fn: (rq: RequestType, _context: ProtoCallContext) => Promise<Empty>
    ): void {
        this.notifications.set(name, async (bytes: Uint8Array, callContext: ProtoCallContext): Promise<void> => {
            const request = parseWrapper(() => requestClass.fromBinary(bytes))
            await fn(request, callContext)
        })
    }
}


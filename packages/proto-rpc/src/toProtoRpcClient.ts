/* eslint-disable @typescript-eslint/consistent-indexed-object-style */

import type { ServiceInfo } from '@protobuf-ts/runtime-rpc'
import { Empty } from '../generated/google/protobuf/empty'
import { ClientTransport } from './ClientTransport'
import { ProtoRpcOptions } from './ProtoCallContext'

interface Indexable {
    [key: string]: any
}

export type ClassType = Record<any | symbol | number, (...args: any) => any> & object | Indexable
type ProtoRpcRealApi<T extends ClassType> = {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    [k in keyof T as T[k] extends Function
        ? k
        : never]:
    
    T[k] extends (...args: infer A) => infer R 
        // if T[k] is a function
        ? R extends { response: Promise<infer P> }
            // if T[k] returns a ptotobuf-ts response, test if P extends Empty
            ? Required<P> extends Empty
                // if P extends Empty one way test if it extends Empty also the other way
                ? Empty extends Required<P>
                    // if P extends Empty also the other way, then type T[k] as notification 
                    ? (...args: A) => Promise<void>
                    // else type T[k] as rpc call
                    : (...args: A) => Promise<P>
                // else type T[k] as rpc call
                : (...args: A) => Promise<P>
            // else if T[k] returns a non-protobuf-ts response (impossible case)
            : never
        // else if T[k] is not a function (impossible case)
        : never
}

export type ProtoRpcClient<T> = ProtoRpcRealApi<T & ClassType>

export function toProtoRpcClient<T extends ServiceInfo & ClassType>(orig: T): ProtoRpcClient<T> {
    const ret: ClassType = {}
    Object.assign(ret, orig)

    // The generated protobuf-ts client only exists to forward to its transport;
    // we drive that transport directly (building the RpcMessage ourselves),
    // bypassing UnaryCall / mergeOptions / stackIntercept. `_transport` is the
    // protobuf-ts generated client's parameter property.
    // eslint-disable-next-line no-underscore-dangle
    const transport = (orig as unknown as { _transport?: unknown })._transport

    const buildOptions = (args: any[], notification: boolean): ProtoRpcOptions => {
        const options = (args.length >= 2 && args[1] != undefined) ? args[1] : {}
        options.isProtoRpc = true
        if (notification) {
            options.notification = true
        }
        return options
    }

    // Legacy fallback (only if the client is backed by a non-ClientTransport
    // RpcTransport — never happens in this codebase): keep the generated path.
    const legacyNotify = async (methodName: string, obj: ClassType, args: any[]): Promise<void> => {
        await obj[methodName].apply(obj, [args[0], buildOptions(args, true)])
    }
    const legacyCall = (methodName: string, obj: ClassType, args: any[]) => {
        return obj[methodName].apply(obj, [args[0], buildOptions(args, false)])
    }

    orig.methods.forEach((method) => {
        const isNotification = method.O.typeName === Empty.typeName
        if (transport instanceof ClientTransport) {
            ret[method.name] = isNotification
                ? (...args: any[]) => transport.notification(method, args[0], buildOptions(args, true))
                : (...args: any[]) => transport.request(method, args[0], buildOptions(args, false))
        } else {
            ret[method.name] = isNotification
                ? (...args: any[]) => legacyNotify(method.name, orig, args)
                : (...args: any[]) => legacyCall(method.name, orig, args).response
        }
    })

    return ret as ProtoRpcClient<T>
}


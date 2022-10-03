/* eslint-disable prefer-spread, @typescript-eslint/consistent-indexed-object-style, 
@typescript-eslint/ban-types, @typescript-eslint/no-invalid-void-type */

import type { ServiceInfo } from "@protobuf-ts/runtime-rpc"
import { Empty } from "./proto/google/protobuf/empty"

interface Indexable {
    [key: string]: any
}

type ClassType = Record<any | symbol | number, (...args: any) => any> & object | Indexable
type ProtoRpcRealApi<T extends ClassType> = {
    [k in keyof T as T[k] extends Function ? k : never]:
    (...args: Parameters<T[k]>) => (
        Promise<Empty> extends (ReturnType<T[k]>)['response'] ? void :
        (ReturnType<T[k]>)['response'])
}

export type ProtoRpcClient<T> = ProtoRpcRealApi<T & ClassType>

export function toProtoRpcClient<T extends ServiceInfo & ClassType>(orig: T): ProtoRpcClient<T> {
    const ret: ClassType = {}
    Object.assign(ret, orig)

    const notify = (methodName: string, obj: ClassType, args: any[]): void => {
        if (args.length < 2) {
            args.push({})
        } else if (!args[1]) {
            args[1] = {}
        }
        args[1].isProtoRpc = true
        args[1].notification = true
       
        obj[methodName].apply(obj, args)
    }

    const callRpc = (methodName: string, obj: ClassType, args: any[]) => {
        if (args.length < 2) {
            args.push({})
        } else if (!args[1]) {
            args[1] = {}
        }
        args[1].isProtoRpc = true
        return obj[methodName].apply(obj, args)
    }

    orig.methods.forEach((method) => {
        if (method.O.typeName === Empty.typeName) {
            ret[method.name] = (...args: any[]) => {
                notify(method.name, orig, args)
            }
        } else {
            ret[method.name] = (...args: any[]) => {
                return callRpc(method.name, orig, args).response
            }
        }
    })

    return ret as ProtoRpcClient<T>
}


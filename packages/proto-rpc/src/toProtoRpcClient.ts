/* eslint-disable prefer-spread, @typescript-eslint/consistent-indexed-object-style */

import type { ServiceInfo } from '@protobuf-ts/runtime-rpc'
import { Empty } from '../generated/google/protobuf/empty'

interface Indexable {
    [key: string]: any
}

export type ClassType = (Record<any | symbol | number, (...args: any) => any> & object) | Indexable
type ProtoRpcRealApi<T extends ClassType> = {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    [k in keyof T as T[k] extends Function ? k : never]: T[k] extends (...args: infer A) => infer R
        ? // if T[k] is a function
          R extends { response: Promise<infer P> }
            ? // if T[k] returns a ptotobuf-ts response, test if P extends Empty
              Required<P> extends Empty
                ? // if P extends Empty one way test if it extends Empty also the other way
                  Empty extends Required<P>
                    ? // if P extends Empty also the other way, then type T[k] as notification
                      (...args: A) => Promise<void>
                    : // else type T[k] as rpc call
                      (...args: A) => Promise<P>
                : // else type T[k] as rpc call
                  (...args: A) => Promise<P>
            : // else if T[k] returns a non-protobuf-ts response (impossible case)
              never
        : // else if T[k] is not a function (impossible case)
          never
}

export type ProtoRpcClient<T> = ProtoRpcRealApi<T & ClassType>

export function toProtoRpcClient<T extends ServiceInfo & ClassType>(orig: T): ProtoRpcClient<T> {
    const ret: ClassType = {}
    Object.assign(ret, orig)

    const notify = async (methodName: string, obj: ClassType, args: any[]): Promise<void> => {
        if (args.length < 2) {
            args.push({})
        } else if (!args[1]) {
            args[1] = {}
        }
        args[1].isProtoRpc = true
        args[1].notification = true

        await obj[methodName].apply(obj, args)
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
                return notify(method.name, orig, args)
            }
        } else {
            ret[method.name] = (...args: any[]) => {
                return callRpc(method.name, orig, args).response
            }
        }
    })

    return ret as ProtoRpcClient<T>
}

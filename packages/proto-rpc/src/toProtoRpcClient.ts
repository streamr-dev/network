/* eslint-disable prefer-spread, @typescript-eslint/consistent-indexed-object-style, 
@typescript-eslint/ban-types, @typescript-eslint/no-invalid-void-type, @typescript-eslint/prefer-function-type */

import type { ServiceInfo } from '@protobuf-ts/runtime-rpc'
import { Empty } from './proto/google/protobuf/empty'

interface Indexable {
    [key: string]: any
}

type ReplaceReturnTypes<T, Replacements extends DecoratorMapType<T>> = {
    [K in keyof T]:
        T[K] extends (...args: infer A) => Promise<infer P>
            ? K extends keyof Replacements
                ? (...args: A) => Promise<InstanceType<Replacements[K]> & P>
            : T[K]
        : T[K]
}

export type ClassType = Record<any | symbol | number, (...args: any) => any> & object | Indexable

type ProtoRpcRealApi<T extends ClassType> = {
    [k in keyof T as T[k] extends Function ? k : never]:
    (...args: Parameters<T[k]>) => (
        Promise<Empty> extends (ReturnType<T[k]>)['response'] ? Promise<void> :
        (ReturnType<T[k]>)['response'])
}

interface DecoratorType<T, L > { new(parent: T): L }

type DecoratorMapType<T> = { [k in keyof T as
    T[k] extends (...args: any) => infer R
        ? R extends { response: Promise<infer _P> }
            ? k
            : never        
        : never ]:
    T[k] extends (...args: any) => infer R 
        ? R extends { response: Promise<infer P> }
            //? { new(parent: P): any }
            ? DecoratorType<P, any>
            : never
        : never       
}

export type ProtoRpcClient<T, M extends DecoratorMapType<T>> = ReplaceReturnTypes<ProtoRpcRealApi<T & ClassType>, M>

export function toProtoRpcClient<T extends ServiceInfo & ClassType, 
    O extends DecoratorMapType<T>>(orig: T,
    returnTypeDecorators?: O): ProtoRpcClient<T, O> {
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

    function objIsDecorator<T>(obj: { new(parent: T): any } | any): obj is { new(parent: T): any } {
        return obj !== undefined
    }

    orig.methods.forEach((method) => {
        if (method.O.typeName === Empty.typeName) {
            ret[method.name] = async (...args: any[]) => {
                return await notify(method.name, orig, args)
            }
        } else {
            ret[method.name] = async (...args: any[]) => {
                if (returnTypeDecorators && objIsDecorator((returnTypeDecorators as Indexable)[method.name])) {
                    const ret = await callRpc(method.name, orig, args).response
                    const dec = new (returnTypeDecorators as Indexable)[method.name](ret)
                    Object.assign(ret, dec)
                    Object.setPrototypeOf(ret, Object.getPrototypeOf(dec))
                    return ret
                } else {
                    return await callRpc(method.name, orig, args).response
                }
            }
        }
    })

    return ret as ProtoRpcClient<T, O>
}


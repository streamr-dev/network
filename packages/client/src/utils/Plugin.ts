import { AnyInstance } from './index'

/**
 * Take prototype functions from srcInstance and attach them to targetInstance while keeping them bound to srcInstance.
 */
export function Plugin<
    TargetType,
    SrcType extends AnyInstance,
    // eslint-disable-next-line
    ResultType extends (TargetType & Methods<SrcType>),
>(targetInstance: TargetType, srcInstance: SrcType): ResultType {
    const protoDescriptors = Object.getOwnPropertyDescriptors(Object.getPrototypeOf(srcInstance))
    const ownDescriptors = Object.getOwnPropertyDescriptors(srcInstance)
    // have to iterate over set of ownKeys otherwise we miss Symbol properties
    const keys = new Set([
        ...Reflect.ownKeys(protoDescriptors),
        ...Reflect.ownKeys(ownDescriptors)
    ])
    const descriptors: [string | symbol, PropertyDescriptor][] = [...keys].map((key) => {
        // @ts-expect-error key can be a symbol, that's ok.
        return [key, key in ownDescriptors ? ownDescriptors[key] : protoDescriptors[key]]
    })

    return descriptors.reduce((target: ResultType, [key, { value }]) => {
        if (typeof value !== 'function') { return target }

        if (key in target) {
            return target // do nothing if already has property
        }

        // eslint-disable-next-line no-param-reassign
        (target as any)[key] = (...args: any) => {
            // @ts-expect-error maybe no key in srcInstance
            return srcInstance[key].call(srcInstance, ...args)
        }
        return target
    }, targetInstance as ResultType)
}

// Get property names which have a Function-typed value i.e. a method
type MethodNames<T> = {
    // undefined extends T[K] to handle optional properties
    [K in keyof T]: (
        // eslint-disable-next-line @typescript-eslint/ban-types
        (undefined extends T[K] ? never : T[K]) extends Function ? K : never
    )
}[keyof T]

// Pick only methods of T
export type Methods<T> = Pick<T, MethodNames<T>>

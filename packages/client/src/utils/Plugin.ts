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
    const descriptors = Object.entries({
        ...Object.getOwnPropertyDescriptors(srcInstance.constructor.prototype),
        ...Object.getOwnPropertyDescriptors(srcInstance)
    })

    return descriptors.reduce((target: ResultType, [key, { value }]) => {
        if (typeof value !== 'function') { return target }

        if (key in target) {
            return target // do nothing if already has property
        }

        // @ts-expect-error ??
        // eslint-disable-next-line no-param-reassign
        target[key] = (...args: any) => {
            // @ts-expect-error ??
            return srcInstance[key].call(srcInstance, ...args)
        }
        return target
    }, targetInstance as ResultType)
}

// Get property names which have a Function-typed value i.e. a method
type MethodNames<T> = {
    // undefined extends T[K] to handle optional properties
    [K in keyof T]: (
        (undefined extends T[K] ? never : T[K]) extends Function ? K : never
    )
}[keyof T]

// Pick only methods of T
export type Methods<T> = Pick<T, MethodNames<T>>

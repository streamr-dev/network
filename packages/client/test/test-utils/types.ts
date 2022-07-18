// Get property names which have a Function-typed value i.e. a method
type MethodNames<T> = {
    // undefined extends T[K] to handle optional properties
    [K in keyof T]: (
        (undefined extends T[K] ? never : T[K]) extends (...args: any[]) => any ? K : never
    )
}[keyof T]

// Pick only methods of T
export type Methods<T> = Pick<T, MethodNames<T>>

import { L } from 'ts-toolbelt'

/* eslint-enable object-curly-newline */

/**
 * Deferred promise allowing external control of resolve/reject.
 * Returns a Promise with resolve/reject functions attached.
 * Also has a wrap(fn) method that wraps a function to settle this promise
 * Also has a wrapError(fn) method that wraps a function to settle this promise if error
 * Defer optionally takes executor function ala `new Promise(executor)`
 */
type PromiseResolve = L.Compulsory<Parameters<Promise<any>['then']>>[0]
type PromiseReject = L.Compulsory<Parameters<Promise<any>['then']>>[1]
 
const noop = () => {}

/*
 * Some TS magic to allow type A = Defer<T>
 * but instead as Deferred<T>
 */
class DeferredWrapper<T> {
    // eslint-disable-next-line class-methods-use-this
    wrap(...args: any[]) {
        return Defer<T>(...args)
    }
}

export type Deferred<T> = ReturnType<DeferredWrapper<T>['wrap']>

export type DeferReturnType<T> = Promise<T> & 
{ 
    resolve: (value: any) => unknown
    reject: (reason: any) => unknown
    wrap: <ArgsType extends any[], ReturnType>(fn: (...args: ArgsType) => ReturnType) => (...args: ArgsType) => Promise<unknown>
    wrapError: <ArgsType extends any[], ReturnType>(fn: (...args: ArgsType) => ReturnType) => (...args: ArgsType) => Promise<ReturnType>
    handleErrBack: (err?: Error | undefined) => void
    isSettled(): boolean
} 

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function Defer<T>(executor: (...args: Parameters<Promise<T>['then']>) => void = noop): DeferReturnType<T> {
    let resolveFn: PromiseResolve | undefined
    let rejectFn: PromiseResolve | undefined
    let isSettled = false
    const resolve: PromiseResolve = (value) => {
        if (resolveFn) {
            const r = resolveFn
            resolveFn = undefined
            rejectFn = undefined
            isSettled = true
            r(value)
        }
    }
    const reject: PromiseReject = (error) => {
        if (rejectFn) {
            const r = rejectFn
            resolveFn = undefined
            rejectFn = undefined
            isSettled = true
            r(error)
        }
    }

    // eslint-disable-next-line promise/param-names
    const p: Promise<T> = new Promise((_resolve, _reject) => {
        resolveFn = _resolve
        rejectFn = _reject
        executor(resolve, reject)
    })
    p.catch(() => {}) // prevent unhandledrejection

    function wrap<ArgsType extends any[], ReturnType>(fn: (...args: ArgsType) => ReturnType) {
        return async (...args: ArgsType) => {
            try {
                return resolve(await fn(...args))
            } catch (err) {
                reject(err)
                throw err
            } finally {
                isSettled = true
            }
        }
    }

    function wrapError<ArgsType extends any[], ReturnType>(fn: (...args: ArgsType) => ReturnType) {
        return async (...args: ArgsType) => {
            try {
                return await fn(...args)
            } catch (err) {
                reject(err)
                throw err
            }
        }
    }

    function handleErrBack(err?: Error) {
        if (err) {
            reject(err)
        } else {
            resolve(undefined)
        }
    }

    return Object.assign(p, {
        resolve,
        reject,
        wrap,
        wrapError,
        handleErrBack,
        isSettled() {
            return isSettled
        },
    })
}

import { listenOnceForAbort } from './listenOnceForAbort'

export class AbortError extends Error {
    readonly code = 'AbortError'
    constructor(customErrorContext?: string) {
        super(customErrorContext === undefined
            ? `aborted`
            : `${customErrorContext} aborted`)
        Error.captureStackTrace(this, AbortError)
    }
}

/**
 * Wraps a Promise into one that can be aborted with `AbortSignal`.
 * Aborting causes the returned Promise to reject with `AbortError` unless
 * the underlying promise itself has already resolved or rejected.
 *
 * Notice that it is the user's responsibility to implement any custom cleanup
 * logic in a `finally` or `catch` block in case of resources that need to be
 * freed up.
 */
export function asAbortable<T>(
    promise: Promise<T>,
    abortSignal?: AbortSignal,
    customErrorContext?: string
): Promise<T> {
    let state: { clear: () => void }
    return new Promise<T>((resolve, reject) => {
        if (abortSignal !== undefined) {
            state = listenOnceForAbort(abortSignal, () => reject(new AbortError(customErrorContext)))
        }
        promise.then(resolve, reject)
    }).finally(() => {
        if (state !== undefined) {
            state.clear()
        }
    })
}

export class AbortError extends Error {
    readonly code = 'AbortError'
    constructor(customErrorContext?: string) {
        super(customErrorContext === undefined ? `aborted` : `${customErrorContext} aborted`)
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
    if (abortSignal === undefined) {
        return promise
    }
    if (abortSignal.aborted) {
        return Promise.reject(new AbortError(customErrorContext))
    }
    let abortListener: () => void
    return new Promise<T>((resolve, reject) => {
        abortListener = () => {
            reject(new AbortError(customErrorContext))
        }
        abortSignal.addEventListener('abort', abortListener)
        promise.then(resolve, reject)
    }).finally(() => {
        abortSignal.removeEventListener('abort', abortListener)
    })
}

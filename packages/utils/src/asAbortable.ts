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
    if (abortSignal?.aborted === true) {
        return Promise.reject(new AbortError(customErrorContext))
    }
    let abortListener: () => void
    return new Promise<T>((resolve, reject) => {
        if (abortSignal !== undefined) {
            abortListener = () => {
                reject(new AbortError(customErrorContext))
            }
            // TODO remove the type casting when type definition for abortController has been updated to include addEventListener
            (abortSignal as any).addEventListener('abort', abortListener)
        }
        promise.then(resolve, reject)
    }).finally(() => {
        if (abortListener !== undefined) {
            // TODO remove the type casting when type definition for abortController has been updated to include removeEventListener
            (abortSignal as any).removeEventListener('abort', abortListener)
        }
    })
}

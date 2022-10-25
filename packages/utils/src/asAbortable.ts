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
 * Wraps a Promise into one that can be aborted with `AbortController`.
 * Aborting causes the returned Promise to reject with `AbortError` unless
 * the underlying promise itself has already resolved or rejected.
 *
 * Notice that it is the user's responsibility to implement any custom cleanup
 * logic in a `finally` or `catch` block in case of resources that need to be
 * freed up.
 */
export function asAbortable<T>(
    promise: Promise<T>,
    abortController?: AbortController,
    customErrorContext?: string
): Promise<T> {
    if (abortController?.signal.aborted === true) {
        return Promise.reject(new AbortError(customErrorContext))
    }
    let abortListener: () => void
    return new Promise<T>((resolve, reject) => {
        if (abortController?.signal !== undefined) {
            abortListener = () => {
                reject(new AbortError(customErrorContext))
            }
            // TODO remove the type casting when type definition for abortController has been updated to include addEventListener
            (abortController.signal as any).addEventListener('abort', abortListener)
        }
        promise.then(resolve, reject)
    }).finally(() => {
        if (abortListener !== undefined) {
            // TODO remove the type casting when type definition for abortController has been updated to include removeEventListener
            (abortController!.signal as any).removeEventListener('abort', abortListener)
        }
    })
}

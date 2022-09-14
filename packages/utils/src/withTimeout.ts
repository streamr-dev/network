export class TimeoutError extends Error {
    readonly code = 'TimeoutError'
    constructor(timeoutInMs: number, customErrorContext?: string) {
        super(customErrorContext === undefined
            ? `timed out after ${timeoutInMs} ms`
            : `${customErrorContext} (timed out after ${timeoutInMs} ms)`)
        Error.captureStackTrace(this, TimeoutError)
    }
}

export class AbortError extends Error {
    readonly code = 'AbortError'
    constructor(customErrorContext?: string) {
        super(customErrorContext)
        Error.captureStackTrace(this, AbortError)
    }
}

export const withTimeout = <T>(
    task: Promise<T>,
    timeoutInMs: number,
    customErrorContext?: string,
    abortController?: AbortController
): Promise<T> => {
    if (abortController?.signal?.aborted === true) {
        return Promise.reject(new AbortError(customErrorContext))
    }
    let timeoutRef: NodeJS.Timeout
    return Promise.race([
        task,
        new Promise<T>((_resolve, reject) => {
            timeoutRef = setTimeout(() => {
                reject(new TimeoutError(timeoutInMs, customErrorContext))
            }, timeoutInMs)
            if (abortController !== undefined) {
                // TODO remove the type casting when type definition for abortController has been updated to include addEventListener
                (abortController.signal as any).addEventListener('abort', () => {
                    reject(new AbortError(customErrorContext))
                })
            }
        })
    ]).finally(() => {
        clearTimeout(timeoutRef) // clear timeout if promise wins race
    })
}

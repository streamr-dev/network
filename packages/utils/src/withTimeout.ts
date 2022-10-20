import { AbortError } from './AbortError'

export class TimeoutError extends Error {
    readonly code = 'TimeoutError'
    constructor(timeoutInMs: number, customErrorContext?: string) {
        super(customErrorContext === undefined
            ? `timed out after ${timeoutInMs} ms`
            : `${customErrorContext} (timed out after ${timeoutInMs} ms)`)
        Error.captureStackTrace(this, TimeoutError)
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
    let abortListener: () => void
    return Promise.race([
        task,
        new Promise<T>((_resolve, reject) => {
            timeoutRef = setTimeout(() => {
                reject(new TimeoutError(timeoutInMs, customErrorContext))
            }, timeoutInMs)
            if (abortController !== undefined) {
                // TODO remove the type casting when type definition for abortController has been updated to include addEventListener
                abortListener = () => {
                    reject(new AbortError(customErrorContext))
                }
                (abortController.signal as any).addEventListener('abort', abortListener)
            }
        })
    ]).finally(() => {
        clearTimeout(timeoutRef) // clear timeout if promise wins race
        if (abortListener !== undefined) {
            // TODO remove the type casting when type definition for abortController has been updated to include removeEventListener
            (abortController!.signal as any).removeEventListener('abort', abortListener)
        }
    })
}

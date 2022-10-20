import { AbortError } from './AbortError'

/**
 * Wait for a specific time
 * @param ms time to wait for in milliseconds
 * @param abortController to control cancellation of any wait
 * @returns {Promise<void>} resolves when time has passed
 */
export function wait(ms: number, abortController?: AbortController): Promise<void> {
    if (abortController?.signal?.aborted === true) {
        return Promise.reject(new AbortError())
    }
    let timeoutRef: NodeJS.Timeout
    let abortListener: () => void
    return new Promise<void>((resolve, reject) => {
        if (abortController !== undefined) {
            // TODO remove the type casting when type definition for abortController has been updated to include addEventListener
            abortListener = () => {
                reject(new AbortError())
            }
            (abortController.signal as any).addEventListener('abort', abortListener)
        }
        timeoutRef = setTimeout(resolve, ms)
    }).finally(() => {
        clearTimeout(timeoutRef)
        if (abortListener !== undefined) {
            // TODO remove the type casting when type definition for abortController has been updated to include removeEventListener
            (abortController!.signal as any).removeEventListener('abort', abortListener)
        }
    })
}

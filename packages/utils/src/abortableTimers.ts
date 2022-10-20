/**
 * setTimeout with AbortController support. Aborting will simply clear
 * the timeout silently.
 */
export const setAbortableTimeout = createAbortableTimerFn(setTimeout, clearTimeout, true)

/**
 * setInterval with AbortController support. Aborting will simply clear
 * the interval silently.
 */
export const setAbortableInterval = createAbortableTimerFn(setInterval, clearInterval, false)

function createAbortableTimerFn(
    setupTimerFn: (cb: () => void, ms?: number) => NodeJS.Timer,
    clearFn: (ref: NodeJS.Timer) => void,
    removeListenerAfterCb: boolean
): (cb: () => void, ms?: number, abortSignal?: AbortSignal) => NodeJS.Timer {
    return (callback, ms, abortSignal) => {
        if (abortSignal?.aborted) {
            return setTimeout(() => {})
        }
        let abortListener: () => void
        if (abortSignal !== undefined) {
            abortListener = () => {
                clearFn(timeoutRef)
            }
            // TODO remove the type casting when type definition for abortController has been updated to include addEventListener
            (abortSignal as any).addEventListener('abort', abortListener)
        }
        const timeoutRef = setupTimerFn(() => {
            if (abortListener !== undefined && removeListenerAfterCb) {
                // TODO remove the type casting when type definition for abortController has been updated to include removeEventListener
                (abortSignal as any).removeEventListener('abort', abortListener)
            }
            callback()
        }, ms)
        return timeoutRef
    }
}

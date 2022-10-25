/**
 * setTimeout with AbortSignal support. Aborting will simply clear
 * the timeout silently.
 */
export const setAbortableTimeout = createAbortableTimerFn(setTimeout, clearTimeout, true)

/**
 * setInterval with AbortSignal support. Aborting will simply clear
 * the interval silently.
 */
export const setAbortableInterval = createAbortableTimerFn(setInterval, clearInterval, false)

function createAbortableTimerFn(
    setupTimerFn: (cb: () => void, ms?: number) => NodeJS.Timer,
    clearFn: (ref: NodeJS.Timer) => void,
    removeListenerOnCb: boolean
): (cb: () => void, ms?: number, abortSignal?: AbortSignal) => void {
    return (callback, ms, abortSignal): void => {
        if (abortSignal?.aborted) {
            return
        }
        let abortListener: () => void
        if (abortSignal !== undefined) {
            abortListener = () => {
                clearFn(timeoutRef)
                // TODO remove the type casting when type definition for abortController has been updated to include addEventListener
                ;(abortSignal as any).removeEventListener('abort', abortListener)
            }
            // TODO remove the type casting when type definition for abortController has been updated to include addEventListener
            (abortSignal as any).addEventListener('abort', abortListener)
        }
        const timeoutRef = setupTimerFn(() => {
            if (abortListener !== undefined && removeListenerOnCb) {
                // TODO remove the type casting when type definition for abortController has been updated to include removeEventListener
                (abortSignal as any).removeEventListener('abort', abortListener)
            }
            callback()
        }, ms)
    }
}

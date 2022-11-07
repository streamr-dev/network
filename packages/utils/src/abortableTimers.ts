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
): (cb: () => void, ms: number, abortSignal: AbortSignal) => void {
    return (callback, ms, abortSignal): void => {
        if (abortSignal.aborted) {
            return
        }
        const abortListener = () => {
            clearFn(timeoutRef)
        }
        abortSignal.addEventListener('abort', abortListener, { once: true })
        const timeoutRef = setupTimerFn(() => {
            if (removeListenerOnCb) {
                abortSignal.removeEventListener('abort', abortListener)
            }
            callback()
        }, ms)
    }
}
